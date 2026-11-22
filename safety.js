// Phase 1 safety layer: version history, audit log, cloud backups and restore.
import {validate} from './stock.js';

export const COLLECTIONS=['jobs','inventory','staff','clients','tasks','projects','packages','crewInvites','crossHires','quotes'];
export const BACKUP_FORMAT={format:'hd-events-hq-backup',version:1,storageKey:'hde_hq_v1'}; // same format the owner page's "Import backup" accepts
const DAILY_KEEP_DAYS=35;      // keeps at least 30 daily copies
const STALE_HOURS=26;          // status turns red if no good backup for this long
const label=row=>String(row?.title??row?.name??row?.item??row?.id??'').slice(0,60);

export function keepVersions(env){const n=Number(env.VERSIONS_KEEP);return Number.isSafeInteger(n)&&n>=5&&n<=500?n:50;}

export function counts(state){return Object.fromEntries(COLLECTIONS.map(k=>[k,Array.isArray(state?.[k])?state[k].length:0]));}

// Summarise what changed between two workspace states, per collection.
export function diff(before,after){
  const out={};
  for(const key of COLLECTIONS){
    const a=new Map((before?.[key]||[]).map(r=>[r.id,r])),b=new Map((after?.[key]||[]).map(r=>[r.id,r]));
    const added=[],removed=[],changed=[];
    for(const [id,row] of b){if(!a.has(id))added.push(label(row));else if(JSON.stringify(a.get(id))!==JSON.stringify(row))changed.push(label(row));}
    for(const [id,row] of a)if(!b.has(id))removed.push(label(row));
    if(added.length||removed.length||changed.length)out[key]={added:added.slice(0,10),removed:removed.slice(0,10),changed:changed.slice(0,10),counts:[added.length,removed.length,changed.length]};
  }
  for(const key of ['branding','company'])if(JSON.stringify(before?.[key]??null)!==JSON.stringify(after?.[key]??null))out[key]={changed:[key],counts:[0,0,1]};
  return out;
}

async function sha256(text){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}

// Save a new workspace state. Keeps the replaced state as a version and writes an audit entry,
// all in one transaction guarded by the revision number.
export async function saveWorkspace(env,email,revision,state,reason='save',extra={}){
  const current=await env.DB.prepare('SELECT revision,payload FROM workspace WHERE id=1').first();
  if(!current)return {status:503,message:'Workspace setup is incomplete'};
  if(current.revision!==revision)return {status:409,message:'Another device saved first. Reload to review its changes.'};
  const now=new Date().toISOString(),payload=JSON.stringify(state);
  const summary=JSON.stringify({...extra,changes:diff(JSON.parse(current.payload),state)});
  const results=await env.DB.batch([
    env.DB.prepare('INSERT INTO workspace_versions (revision,payload,saved_at,saved_by,reason) SELECT revision,payload,?,?,? FROM workspace WHERE id=1 AND revision=?').bind(now,email,reason,revision),
    env.DB.prepare('UPDATE workspace SET payload=?, revision=revision+1 WHERE id=1 AND revision=?').bind(payload,revision),
    env.DB.prepare('INSERT INTO audit_log (at,email,action,revision,summary) SELECT ?,?,?,?,? WHERE changes()=1').bind(now,email,reason,revision+1,summary),
    env.DB.prepare('DELETE FROM workspace_versions WHERE id NOT IN (SELECT id FROM workspace_versions ORDER BY id DESC LIMIT ?)').bind(keepVersions(env)),
  ]);
  return results[1].meta.changes===1?{status:200,revision:revision+1}:{status:409,message:'Another device saved first. Reload to review its changes.'};
}

export async function listVersions(env){
  const {results}=await env.DB.prepare('SELECT id,revision,saved_at,saved_by,reason,length(payload) AS bytes FROM workspace_versions ORDER BY id DESC').all();
  return results;
}
export async function listAudit(env,limit=200){
  const {results}=await env.DB.prepare('SELECT id,at,email,action,revision,summary FROM audit_log ORDER BY id DESC LIMIT ?').bind(Math.min(Math.max(1,limit|0),1000)).all();
  return results.map(r=>({...r,summary:JSON.parse(r.summary)}));
}

// Restore an earlier version or a cloud backup. The state being replaced is itself kept as a version,
// so a restore can always be undone.
export async function restore(env,email,{versionId,backupKey}){
  let state,source;
  if(Number.isSafeInteger(versionId)){
    const row=await env.DB.prepare('SELECT revision,saved_at,payload FROM workspace_versions WHERE id=?').bind(versionId).first();
    if(!row)return {status:404,message:'That version no longer exists.'};
    state=JSON.parse(row.payload);source={versionId,fromRevision:row.revision,savedAt:row.saved_at};
  }else if(typeof backupKey==='string'&&/^(daily|monthly|manual)\/[\w.-]+\.json$/.test(backupKey)){
    if(!env.BACKUPS)return {status:503,message:'Backup storage is not configured.'};
    const checked=await readBackup(env,backupKey);
    if(checked.error)return {status:422,message:checked.error};
    state=checked.backup.data;source={backupKey,fromRevision:checked.backup.revision};
  }else return {status:400,message:'Choose a version or a backup to restore.'};
  try{validate(state);}catch(e){return {status:422,message:'That copy fails the stock checks: '+e.message};}
  const current=await env.DB.prepare('SELECT revision FROM workspace WHERE id=1').first();
  if(!current)return {status:503,message:'Workspace setup is incomplete'};
  return saveWorkspace(env,email,current.revision,state,'restore',{restoredFrom:source});
}

// Read a backup object, check its checksum and that it passes the same validation as a save.
export async function readBackup(env,key){
  const obj=await env.BACKUPS.get(key);
  if(!obj)return {error:'Backup not found: '+key};
  const text=await obj.text();
  const expected=obj.customMetadata?.sha256;
  if(expected&&expected!==await sha256(text))return {error:'Backup checksum does not match: '+key};
  let backup;
  try{backup=JSON.parse(text);}catch{return {error:'Backup is not valid JSON: '+key};}
  if(backup.format!==BACKUP_FORMAT.format||backup.version!==BACKUP_FORMAT.version||!backup.data)return {error:'Not an HD Events HQ backup: '+key};
  try{validate(backup.data);}catch(e){return {error:'Backup fails validation: '+e.message};}
  return {backup,text};
}

// Write today's backup to R2, read it straight back to prove it restores, prune old copies, log the result.
export async function runBackup(env,{kind='daily',now=new Date(),by='scheduled'}={}){
  const at=now.toISOString();
  let key=null;
  try{
    if(!env.BACKUPS)throw Error('Backup storage (BACKUPS bucket) is not configured');
    const row=await env.DB.prepare('SELECT revision,payload FROM workspace WHERE id=1').first();
    if(!row)throw Error('Workspace record missing');
    const state=JSON.parse(row.payload);
    const {results:audit}=await env.DB.prepare('SELECT at,email,action,revision,summary FROM audit_log ORDER BY id').all();
    const backup={...BACKUP_FORMAT,createdAt:at,revision:row.revision,records:counts(state),data:state,audit};
    const text=JSON.stringify(backup);
    const hash=await sha256(text);
    key=kind==='manual'?'manual/'+at.replace(/[:]/g,'-')+'.json':'daily/'+at.slice(0,10)+'.json';
    const meta={httpMetadata:{contentType:'application/json'},customMetadata:{sha256:hash,revision:String(row.revision)}};
    await env.BACKUPS.put(key,text,meta);
    if(kind==='daily'&&at.slice(8,10)==='01')await env.BACKUPS.put('monthly/'+at.slice(0,7)+'.json',text,meta); // monthly copies are never pruned
    // Restore check: read it back, verify checksum, validate, compare record counts.
    const check=await readBackup(env,key);
    if(check.error)throw Error('Verification failed: '+check.error);
    if(JSON.stringify(counts(check.backup.data))!==JSON.stringify(counts(state)))throw Error('Verification failed: record counts differ');
    const pruned=await prune(env,now);
    await env.DB.prepare('INSERT INTO backup_log (at,ok,object_key,bytes,sha256,revision,records) VALUES (?,1,?,?,?,?,?)')
      .bind(at,key,text.length,hash,row.revision,JSON.stringify(counts(state))).run();
    await env.DB.prepare('INSERT INTO audit_log (at,email,action,revision,summary) VALUES (?,?,?,?,?)')
      .bind(at,by,'backup',row.revision,JSON.stringify({key,bytes:text.length,pruned})).run();
    return {ok:true,key,bytes:text.length,sha256:hash,revision:row.revision,pruned};
  }catch(e){
    const error=String(e?.message||e).slice(0,500);
    try{await env.DB.prepare('INSERT INTO backup_log (at,ok,object_key,error) VALUES (?,0,?,?)').bind(at,key,error).run();}catch{}
    try{await env.DB.prepare('INSERT INTO audit_log (at,email,action,revision,summary) VALUES (?,?,?,NULL,?)').bind(at,by,'backup-failed',JSON.stringify({error})).run();}catch{}
    await alert(env,'HD Events HQ backup FAILED at '+at+': '+error);
    return {ok:false,error};
  }
}

async function prune(env,now){
  const cutoff=new Date(now.getTime()-DAILY_KEEP_DAYS*86400000).toISOString().slice(0,10);
  let cursor,removed=[];
  do{
    const page=await env.BACKUPS.list({prefix:'daily/',cursor});
    for(const o of page.objects){const day=o.key.slice(6,16);if(day<cutoff)removed.push(o.key);}
    cursor=page.truncated?page.cursor:undefined;
  }while(cursor);
  if(removed.length)await env.BACKUPS.delete(removed);
  return removed.length;
}

export async function listBackups(env){
  if(!env.BACKUPS)return [];
  const out=[];
  for(const prefix of ['daily/','monthly/','manual/']){
    let cursor;
    do{const page=await env.BACKUPS.list({prefix,cursor,include:['customMetadata']});out.push(...page.objects.map(o=>({key:o.key,bytes:o.size,uploaded:o.uploaded,revision:o.customMetadata?.revision})));cursor=page.truncated?page.cursor:undefined;}while(cursor);
  }
  return out.sort((a,b)=>String(b.key).localeCompare(String(a.key)));
}

export async function status(env,now=new Date()){
  const last=await env.DB.prepare('SELECT at,ok,object_key,bytes,error FROM backup_log ORDER BY id DESC LIMIT 1').first();
  const good=await env.DB.prepare('SELECT at,object_key,bytes,revision FROM backup_log WHERE ok=1 ORDER BY id DESC LIMIT 1').first();
  const versions=await env.DB.prepare('SELECT COUNT(*) AS n FROM workspace_versions').first();
  const ageHours=good?(now-Date.parse(good.at))/3600000:Infinity;
  const healthy=!!env.BACKUPS&&!!good&&!!last?.ok&&ageHours<=STALE_HOURS;
  let problem=null;
  if(!env.BACKUPS)problem='Backup storage is not connected yet.';
  else if(!good)problem='No successful backup yet.';
  else if(!last.ok)problem='Last backup failed: '+last.error;
  else if(ageHours>STALE_HOURS)problem='No backup for '+Math.floor(ageHours)+' hours.';
  return {healthy,problem,lastAttempt:last||null,lastSuccess:good||null,versions:versions?.n||0,keepVersions:keepVersions(env)};
}

// Optional: post failures to a chat/notification webhook (for example ntfy, Slack or Discord) set as the ALERT_WEBHOOK secret.
async function alert(env,text){
  if(!env.ALERT_WEBHOOK)return;
  try{await fetch(env.ALERT_WEBHOOK,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,content:text})});}catch{}
}
