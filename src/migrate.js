// One-off move from the single `workspace` record to proper tables.
// Safe to re-run until it succeeds; it refuses to run again once it has.
import {validate} from '../public/app/stock.js';
import {TABLES,COLLECTIONS,isMigrated,loadState,legacyState} from './store.js';
import {dataUrlToFile} from './files.js';
import {runBackup,counts} from './safety.js';

// Move embedded data: images out of the records into file storage.
async function extractImages(env,state){
  const moved=[];
  if(typeof state.branding?.logo==='string'&&state.branding.logo.startsWith('data:')){
    state.branding={...state.branding,logo:await dataUrlToFile(env,'branding',state.branding.logo)};moved.push('branding logo');
  }
  for(const item of state.inventory||[]){
    if(typeof item.photo==='string'&&item.photo.startsWith('data:')){item.photo=await dataUrlToFile(env,'equipment',item.photo);moved.push('photo: '+item.name);}
  }
  return moved;
}

export async function migrate(env,email){
  if(await isMigrated(env))return {ok:false,status:409,error:'Already moved to tables.'};
  const at=new Date().toISOString();
  const log=async(ok,before,after,detail)=>env.DB.prepare('INSERT INTO migration_log (at,email,ok,before_counts,after_counts,detail) VALUES (?,?,?,?,?,?)')
    .bind(at,email,ok?1:0,JSON.stringify(before),after&&JSON.stringify(after),JSON.stringify(detail)).run();
  const legacy=await legacyState(env);
  if(!legacy)return {ok:false,status:503,error:'No existing workspace found.'};
  const original=legacy.state,before=counts(original);
  try{
    try{validate(original);}catch(e){throw Error('The current workspace fails its own checks, so it was not moved: '+e.message);}
    // 1. Safety copy of the untouched workspace, verified, before anything changes.
    const backup=await runBackup(env,{kind:'manual',by:email+' (before table move)'});
    if(!backup.ok)throw Error('Could not take a safety backup first: '+backup.error);
    // 2. Images out to file storage.
    const state=structuredClone(original);
    const moved=await extractImages(env,state);
    // 3. Clear any half-finished earlier attempt, then insert every record.
    const stmts=[...COLLECTIONS.map(c=>env.DB.prepare(`DELETE FROM ${TABLES[c]}`)),env.DB.prepare('DELETE FROM settings')];
    for(const c of COLLECTIONS)for(const r of state[c])
      stmts.push(env.DB.prepare(`INSERT INTO ${TABLES[c]} (id,version,data,updated_at,updated_by) VALUES (?,1,?,?,?)`).bind(r.id,JSON.stringify(r),at,email));
    for(const k of Object.keys(state))if(!COLLECTIONS.includes(k))
      stmts.push(env.DB.prepare('INSERT INTO settings (key,version,data,updated_at,updated_by) VALUES (?,1,?,?,?)').bind(k,JSON.stringify(state[k]),at,email));
    for(let i=0;i<stmts.length;i+=500)await env.DB.batch(stmts.slice(i,i+500));
    // 4. Read everything back and compare record by record.
    const {state:loaded}=await loadState(env);
    const after=counts(loaded);
    const problems=[];
    for(const c of COLLECTIONS){
      if(before[c]!==after[c])problems.push(`${c}: ${before[c]} before, ${after[c]} after`);
      const want=new Map(state[c].map(r=>[r.id,JSON.stringify(r)]));
      for(const r of loaded[c])if(want.get(r.id)!==JSON.stringify(r))problems.push(`${c} #${r.id} differs`);
    }
    for(const k of Object.keys(state))if(!COLLECTIONS.includes(k)&&JSON.stringify(state[k])!==JSON.stringify(loaded[k]))problems.push(`setting ${k} differs`);
    try{validate(loaded);}catch(e){problems.push('validation: '+e.message);}
    if(problems.length)throw Error('Check failed: '+problems.slice(0,10).join('; '));
    // 5. Switch over.
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO meta (key,value) VALUES ('migrated','1')"),
      env.DB.prepare("INSERT OR REPLACE INTO meta (key,value) VALUES ('migrated_at',?)").bind(at),
      env.DB.prepare('INSERT INTO audit_log (at,email,action,revision,summary) VALUES (?,?,?,?,?)').bind(at,email,'migrate',legacy.revision,JSON.stringify({before,after,moved,backup:backup.key})),
    ]);
    await log(true,before,after,{moved,backup:backup.key});
    return {ok:true,before,after,moved,backup:backup.key};
  }catch(e){
    const error=String(e?.message||e);
    try{await log(false,before,null,{error});}catch{}
    return {ok:false,status:500,error,before};
  }
}
