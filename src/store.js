// Phase 2 data store: one table per collection, per-record saves with version checks,
// and a before-image of every change so any save can be undone.
import {validate} from '../public/app/stock.js';

// App collection name -> table name.
export const TABLES={jobs:'jobs',inventory:'inventory',staff:'staff',clients:'clients',tasks:'tasks',projects:'projects',packages:'packages',crewInvites:'crew_invites',crossHires:'cross_hires',quotes:'quotes'};
export const COLLECTIONS=Object.keys(TABLES);
const SETTINGS='settings';
const SETTING_KEY=/^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const HISTORY_DAYS=90;

export class Conflict extends Error{constructor(m='Another device changed this record first. Reload to review its changes.'){super(m);this.status=409;}}
export class Invalid extends Error{constructor(m){super(m);this.status=422;}}

export async function isMigrated(env){
  try{const r=await env.DB.prepare("SELECT value FROM meta WHERE key='migrated'").first();return r?.value==='1';}
  catch{return false;} // tables not created yet
}

// The pre-Phase 2 single record, kept untouched as a fallback.
export async function legacyState(env){
  const row=await env.DB.prepare('SELECT revision,payload FROM workspace WHERE id=1').first();
  return row?{revision:row.revision,state:JSON.parse(row.payload)}:null;
}

// The live workspace, from the tables once moved, otherwise from the old single record.
export async function currentState(env){
  if(await isMigrated(env))return (await loadState(env)).state;
  return (await legacyState(env))?.state??null;
}

// Load every record. Returns the workspace state the app works with, plus each record's version.
export async function loadState(env){
  const tables=[...COLLECTIONS.map(c=>TABLES[c]),SETTINGS];
  const results=await env.DB.batch(tables.map(t=>env.DB.prepare(t===SETTINGS?'SELECT key,version,data FROM settings ORDER BY key':`SELECT id,version,data FROM ${t} ORDER BY rowid`)));
  const state={},versions={};
  COLLECTIONS.forEach((c,i)=>{
    state[c]=[];versions[c]={};
    for(const r of results[i].results){state[c].push(JSON.parse(r.data));versions[c][r.id]=r.version;}
  });
  versions[SETTINGS]={};
  for(const r of results.at(-1).results){state[r.key]=JSON.parse(r.data);versions[SETTINGS][r.key]=r.version;}
  return {state,versions};
}

// Check the shape of a change list sent by the browser.
export function checkChanges(changes){
  if(!Array.isArray(changes)||changes.length>5000)throw new Invalid('Invalid change list');
  const seen=new Set();
  for(const ch of changes){
    if(!ch||typeof ch!=='object')throw new Invalid('Invalid change');
    if(!['put','delete'].includes(ch.op))throw new Invalid('Invalid change type');
    if(!Number.isSafeInteger(ch.version)||ch.version<0)throw new Invalid('Invalid record version');
    if(ch.collection===SETTINGS){if(typeof ch.id!=='string'||!SETTING_KEY.test(ch.id)||COLLECTIONS.includes(ch.id))throw new Invalid('Invalid setting');}
    else if(!COLLECTIONS.includes(ch.collection))throw new Invalid('Unknown collection');
    else if(!Number.isSafeInteger(ch.id))throw new Invalid('Invalid record ID');
    if(ch.op==='put'){
      if(ch.data===null||typeof ch.data!=='object')throw new Invalid('Invalid record');
      if(ch.collection!==SETTINGS&&(Array.isArray(ch.data)||ch.data.id!==ch.id))throw new Invalid('Record ID mismatch');
    }
    const key=ch.collection+':'+ch.id;
    if(seen.has(key))throw new Invalid('Record listed twice');
    seen.add(key);
  }
}

// Apply a set of record changes atomically. Every change carries the version the browser last saw;
// if any record has moved on since, nothing is written. Returns the new version of each record.
export async function applyChanges(env,email,changes,{reason='save',summaryExtra={}}={}){
  checkChanges(changes);
  if(!changes.length)return {versions:[],saveId:null};
  const {state,versions}=await loadState(env);
  const before={};
  // Merge into the current state, checking versions as we go.
  for(const ch of changes){
    const isSetting=ch.collection===SETTINGS;
    const current=isSetting?versions[SETTINGS][ch.id]:versions[ch.collection][ch.id];
    if((current??0)!==ch.version)throw new Conflict();
    if(ch.op==='delete'&&current===undefined)throw new Conflict();
    const key=ch.collection+':'+ch.id;
    if(isSetting){
      before[key]=current===undefined?null:state[ch.id];
      if(ch.op==='put')state[ch.id]=ch.data;else delete state[ch.id];
    }else{
      const list=state[ch.collection],i=list.findIndex(r=>r.id===ch.id);
      before[key]=i<0?null:list[i];
      if(ch.op==='delete')list.splice(i,1);
      else if(i<0)list.push(ch.data);else list[i]=ch.data;
    }
  }
  try{validate(state);}catch(e){throw new Invalid(e.message);}

  const now=new Date().toISOString(),saveId=Date.now()*1000+Math.floor(Math.random()*1000);
  const stmts=[],out=[];
  for(const ch of changes){
    const isSetting=ch.collection===SETTINGS,table=isSetting?SETTINGS:TABLES[ch.collection],idCol=isSetting?'key':'id';
    const key=ch.collection+':'+ch.id,prev=before[key];
    const op=ch.op==='delete'?'delete':prev===null?'create':'update';
    if(op==='create')stmts.push(env.DB.prepare(`INSERT INTO ${table} (${idCol},version,data,updated_at,updated_by) VALUES (?,1,?,?,?)`).bind(ch.id,JSON.stringify(ch.data),now,email));
    else if(op==='update')stmts.push(env.DB.prepare(`UPDATE ${table} SET data=?,version=version+1,updated_at=?,updated_by=? WHERE ${idCol}=? AND version=?`).bind(JSON.stringify(ch.data),now,email,ch.id,ch.version));
    else stmts.push(env.DB.prepare(`DELETE FROM ${table} WHERE ${idCol}=? AND version=?`).bind(ch.id,ch.version));
    // Aborts the whole batch if the statement above did not change exactly one row.
    stmts.push(env.DB.prepare('INSERT INTO sync_guard (ok) VALUES (changes())'));
    stmts.push(env.DB.prepare('INSERT INTO record_history (save_id,at,email,reason,collection,record_id,op,before) VALUES (?,?,?,?,?,?,?,?)')
      .bind(saveId,now,email,reason,ch.collection,String(ch.id),op,prev===null?null:JSON.stringify(prev)));
    out.push({collection:ch.collection,id:ch.id,version:op==='delete'?null:ch.version+1});
  }
  stmts.push(env.DB.prepare('DELETE FROM sync_guard'));
  stmts.push(env.DB.prepare('INSERT INTO audit_log (at,email,action,revision,summary) VALUES (?,?,?,?,?)')
    .bind(now,email,reason,saveId,JSON.stringify({...summaryExtra,saveId,changes:summarise(changes,before)})));
  try{await env.DB.batch(stmts);}
  catch(e){if(/CHECK constraint|UNIQUE constraint|PRIMARY KEY/i.test(String(e?.message)))throw new Conflict();throw e;}
  return {versions:out,saveId};
}

const label=r=>String(r?.title??r?.name??r?.item??r?.id??'').slice(0,60);
function summarise(changes,before){
  const out={};
  for(const ch of changes){
    const c=out[ch.collection]??={added:[],removed:[],changed:[],counts:[0,0,0]};
    const prev=before[ch.collection+':'+ch.id];
    const [list,n]=ch.op==='delete'?['removed',1]:prev===null?['added',0]:['changed',2];
    c.counts[n]++;
    if(c[list].length<10)c[list].push(ch.collection==='settings'?ch.id:label(ch.op==='delete'?prev:ch.data));
  }
  return out;
}

// Recent saves, newest first, for the history panel.
export async function listSaves(env,limit=100){
  const {results}=await env.DB.prepare(`SELECT save_id,MIN(at) AS at,MIN(email) AS email,MIN(reason) AS reason,COUNT(*) AS records,
      group_concat(collection||':'||op, ',') AS ops FROM record_history GROUP BY save_id ORDER BY MIN(id) DESC LIMIT ?`).bind(Math.min(Math.max(1,limit|0),500)).all();
  return results;
}

// Put every record touched by save `saveId` or any later save back to how it was just before `saveId`.
// Applied as a normal save (with its own history), so the undo can itself be undone.
export async function undoTo(env,email,saveId){
  if(!Number.isSafeInteger(saveId))throw new Invalid('Choose a save to undo');
  // Row ids only ever increase, so "this save and everything after it" is every row from its first one.
  const {results}=await env.DB.prepare('SELECT collection,record_id,before FROM record_history WHERE id>=(SELECT MIN(id) FROM record_history WHERE save_id=?) ORDER BY id').bind(saveId).all();
  if(!results.length)throw new Invalid('That save is no longer in the history.');
  const target=new Map();
  for(const r of results){const key=r.collection+':'+r.record_id;if(!target.has(key))target.set(key,r);} // earliest before-image wins
  const {state,versions}=await loadState(env);
  const desired={};
  for(const [key,r] of target)desired[key]=r.before===null?null:JSON.parse(r.before);
  const changes=changeSet(state,versions,desired);
  return applyChanges(env,email,changes,{reason:'restore',summaryExtra:{undoTo:saveId}});
}

// Replace the whole workspace with `next` (a full state, e.g. from a backup). Only differences are written.
export async function replaceAll(env,email,next,extra={}){
  try{validate(next);}catch(e){throw new Invalid('That copy fails the stock checks: '+e.message);}
  const {state,versions}=await loadState(env);
  const desired={};
  for(const c of COLLECTIONS){
    for(const r of state[c])desired[c+':'+r.id]=null;
    for(const r of next[c])desired[c+':'+r.id]=r;
  }
  for(const k of Object.keys(state))if(!COLLECTIONS.includes(k))desired[SETTINGS+':'+k]=null;
  for(const k of Object.keys(next))if(!COLLECTIONS.includes(k)&&SETTING_KEY.test(k))desired[SETTINGS+':'+k]=next[k];
  return applyChanges(env,email,changeSet(state,versions,desired),{reason:'restore',summaryExtra:extra});
}

// Turn {"collection:id": record-or-null} into the change list needed to get there from the current state.
function changeSet(state,versions,desired){
  const changes=[];
  for(const [key,want] of Object.entries(desired)){
    const i=key.indexOf(':'),collection=key.slice(0,i),raw=key.slice(i+1);
    const isSetting=collection===SETTINGS,id=isSetting?raw:Number(raw);
    const version=(isSetting?versions[SETTINGS][id]:versions[collection]?.[id])??0;
    const have=isSetting?(version?state[id]:undefined):state[collection]?.find(r=>r.id===id);
    if(want===null){if(version)changes.push({collection,id,op:'delete',version});}
    else if(JSON.stringify(have)!==JSON.stringify(want))changes.push({collection,id,op:'put',version,data:want});
  }
  return changes;
}

export async function pruneHistory(env,now=new Date()){
  const cutoff=new Date(now.getTime()-HISTORY_DAYS*86400000).toISOString();
  return (await env.DB.prepare('DELETE FROM record_history WHERE at<?').bind(cutoff).run()).meta.changes;
}
