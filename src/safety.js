// Backups, restore, audit log and the backup status panel.
// Phase 1 built this around the single workspace record; Phase 2 reads and restores through the tables.
import {validate} from '../public/app/stock.js';
import {COLLECTIONS,currentState,replaceAll,pruneHistory} from './store.js';

export const BACKUP_FORMAT={format:'hd-events-hq-backup',version:1,storageKey:'hde_hq_v1'}; // same format the owner page's "Import backup" accepts
export const BACKUP_KEY=/^(daily|monthly|manual)\/[\w.-]+\.json$/;
const DAILY_KEEP_DAYS=35;      // keeps at least 30 daily copies
const STALE_HOURS=26;          // status turns red if no good backup for this long

export function counts(state){return Object.fromEntries(COLLECTIONS.map(k=>[k,Array.isArray(state?.[k])?state[k].length:0]));}

async function sha256(text){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}

export async function listAudit(env,limit=200){
  const {results}=await env.DB.prepare('SELECT id,at,email,action,revision,summary FROM audit_log ORDER BY id DESC LIMIT ?').bind(Math.min(Math.max(1,limit|0),1000)).all();
  return results.map(r=>({...r,summary:JSON.parse(r.summary)}));
}

// Restore a cloud backup. Only records that differ are written, and each keeps its before-image,
// so the restore can be undone from the history panel.
export async function restoreBackup(env,email,key){
  if(typeof key!=='string'||!BACKUP_KEY.test(key))return {status:400,message:'Choose a backup to restore.'};
  if(!env.BACKUPS)return {status:503,message:'Backup storage is not configured.'};
  const checked=await readBackup(env,key);
  if(checked.error)return {status:422,message:checked.error};
  const r=await replaceAll(env,email,checked.backup.data,{restoredFrom:{backupKey:key}});
  return {status:200,...r};
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

// Write a backup to R2, read it straight back to prove it restores, prune old copies, log the result.
export async function runBackup(env,{kind='daily',now=new Date(),by='scheduled'}={}){
  const at=now.toISOString();
  let key=null;
  try{
    if(!env.BACKUPS)throw Error('Backup storage (BACKUPS bucket) is not configured');
    const state=await currentState(env);
    if(!state)throw Error('Workspace record missing');
    const {results:audit}=await env.DB.prepare('SELECT at,email,action,revision,summary FROM audit_log ORDER BY id').all();
    const backup={...BACKUP_FORMAT,createdAt:at,records:counts(state),data:state,audit};
    const text=JSON.stringify(backup);
    const hash=await sha256(text);
    key=kind==='manual'?'manual/'+at.replace(/[:]/g,'-')+'.json':'daily/'+at.slice(0,10)+'.json';
    const meta={httpMetadata:{contentType:'application/json'},customMetadata:{sha256:hash}};
    await env.BACKUPS.put(key,text,meta);
    if(kind==='daily'&&at.slice(8,10)==='01')await env.BACKUPS.put('monthly/'+at.slice(0,7)+'.json',text,meta); // monthly copies are never pruned
    // Restore check: read it back, verify checksum, validate, compare record counts.
    const check=await readBackup(env,key);
    if(check.error)throw Error('Verification failed: '+check.error);
    if(JSON.stringify(counts(check.backup.data))!==JSON.stringify(counts(state)))throw Error('Verification failed: record counts differ');
    const pruned=kind==='daily'?await prune(env,now):0;
    const historyPruned=kind==='daily'?await pruneHistory(env,now).catch(()=>0):0;
    await env.DB.prepare('INSERT INTO backup_log (at,ok,object_key,bytes,sha256,records) VALUES (?,1,?,?,?,?)')
      .bind(at,key,text.length,hash,JSON.stringify(counts(state))).run();
    await env.DB.prepare('INSERT INTO audit_log (at,email,action,revision,summary) VALUES (?,?,?,NULL,?)')
      .bind(at,by,'backup',JSON.stringify({key,bytes:text.length,pruned,historyPruned})).run();
    return {ok:true,key,bytes:text.length,sha256:hash,pruned};
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
    do{const page=await env.BACKUPS.list({prefix,cursor});out.push(...page.objects.map(o=>({key:o.key,bytes:o.size,uploaded:o.uploaded})));cursor=page.truncated?page.cursor:undefined;}while(cursor);
  }
  return out.sort((a,b)=>String(b.uploaded).localeCompare(String(a.uploaded))||b.key.localeCompare(a.key));
}

export async function status(env,now=new Date()){
  const last=await env.DB.prepare('SELECT at,ok,object_key,bytes,error FROM backup_log ORDER BY id DESC LIMIT 1').first();
  const good=await env.DB.prepare('SELECT at,object_key,bytes FROM backup_log WHERE ok=1 ORDER BY id DESC LIMIT 1').first();
  let saves=0;
  try{saves=(await env.DB.prepare('SELECT COUNT(DISTINCT save_id) AS n FROM record_history').first())?.n||0;}catch{}
  const ageHours=good?(now-Date.parse(good.at))/3600000:Infinity;
  const healthy=!!env.BACKUPS&&!!good&&!!last?.ok&&ageHours<=STALE_HOURS;
  let problem=null;
  if(!env.BACKUPS)problem='Backup storage is not connected yet.';
  else if(!good)problem='No successful backup yet.';
  else if(!last.ok)problem='Last backup failed: '+last.error;
  else if(ageHours>STALE_HOURS)problem='No backup for '+Math.floor(ageHours)+' hours.';
  return {healthy,problem,lastAttempt:last||null,lastSuccess:good||null,saves};
}

// Optional: post failures to a chat/notification webhook (for example ntfy, Slack or Discord) set as the ALERT_WEBHOOK secret.
async function alert(env,text){
  if(!env.ALERT_WEBHOOK)return;
  try{await fetch(env.ALERT_WEBHOOK,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,content:text})});}catch{}
}
