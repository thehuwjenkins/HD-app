import {staffEmail} from './access.js';
import {applyChanges,undoTo,replaceAll,isMigrated,loadState,currentState,legacyState} from './store.js';
import {listAudit,restoreBackup,runBackup,listBackups,status,counts,BACKUP_KEY} from './safety.js';
import {storeFile,serveFile,MAX_FILE} from './files.js';
import {migrate} from './migrate.js';
import {generateImage} from './ai.js';
import {crewPage,upgradePage} from './pages.js';
import template from './owner.html';

const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','strict-transport-security':'max-age=31536000',
  // The owner page uses inline event handlers, so script-src is left open; these directives block framing, plugins, <base> hijacking and off-site form posts.
  'content-security-policy':"frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'"};
function reply(body,status=200,type='text/plain;charset=utf-8',extra={}){return new Response(body,{status,headers:{...headers,'content-type':type,...extra}});}
const json=(value,status=200)=>reply(JSON.stringify(value),status,'application/json');
const html=body=>reply(body,200,'text/html;charset=utf-8');

// Writes must come from the owner, from this site.
function writeCheck(req,url,owner,type='application/json'){
  if(!owner||req.headers.get('origin')!==url.origin)return reply('Forbidden',403);
  if(type&&!req.headers.get('content-type')?.startsWith(type))return reply(type==='image/'?'Image required':'JSON required',415);
  return null;
}
async function readJson(req,limit){
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>limit)throw Object.assign(Error('Too much data in one save. Export a backup and contact support.'),{status:413});
  try{return JSON.parse(raw);}catch{throw Object.assign(Error('Invalid JSON'),{status:400});}
}
// Turns thrown errors with a status (conflicts, validation, size) into replies.
async function guarded(fn){
  try{return await fn();}
  catch(e){if(e?.status)return reply(e.message,e.status);throw e;}
}

async function api(req,env,url,email,owner){
  const path=url.pathname,method=req.method;
  if(!owner)return reply('Forbidden',403);
  const migrated=await isMigrated(env);

  if(method==='POST'&&path==='/api/migrate'){
    const denied=writeCheck(req,url,owner);if(denied)return denied;
    const r=await migrate(env,email);
    return json(r,r.ok?200:r.status||500);
  }
  if(!migrated)return reply('Storage upgrade needed. Reload the page.',409);

  if(method==='POST'&&path==='/api/changes'){
    const denied=writeCheck(req,url,owner);if(denied)return denied;
    return guarded(async()=>{
      const {changes}=await readJson(req,4_000_000);
      const r=await applyChanges(env,email,changes);
      return json({versions:r.versions});
    });
  }
  if(method==='PUT'&&path==='/api/workspace')return reply('HD Events HQ has been updated. Reload the page; your last change was not saved.',410);
  if(method==='POST'&&path==='/api/files'){
    const type=req.headers.get('content-type')||'';
    const denied=writeCheck(req,url,owner,'');if(denied)return denied;
    if(Number(req.headers.get('content-length'))>MAX_FILE)return reply('Files must be under 25 MB.',413);
    return guarded(async()=>json({url:await storeFile(env,url.searchParams.get('kind')||'',type.split(';')[0].trim(),await req.arrayBuffer())}));
  }

  if(method==='POST'&&path==='/api/ai/image'){
    const denied=writeCheck(req,url,owner);if(denied)return denied;
    return guarded(async()=>{const {prompt}=await readJson(req,10_000);return json({url:await generateImage(env,prompt)});});
  }
  if(path.startsWith('/api/safety/')){
    const route=method+' '+path.slice(12);
    if(route==='GET status')return json(await status(env));
    if(route==='GET audit')return json(await listAudit(env,Number(url.searchParams.get('limit'))||200));
    if(route==='GET backups')return json(await listBackups(env));
    if(route==='GET download'){
      const key=url.searchParams.get('key')||'';
      if(!env.BACKUPS||!BACKUP_KEY.test(key))return reply('Not found',404);
      const obj=await env.BACKUPS.get(key);if(!obj)return reply('Not found',404);
      return new Response(obj.body,{headers:{...headers,'content-type':'application/json','content-disposition':'attachment; filename="HD_Events_HQ_'+key.replace('/','_')+'"'}});
    }
    if(method==='POST'){
      const denied=writeCheck(req,url,owner);if(denied)return denied;
      return guarded(async()=>{
        const body=await readJson(req,route==='POST import'?16_000_000:10_000);
        if(route==='POST undo'){const r=await undoTo(env,email,body.saveId);return json({saveId:r.saveId,records:r.versions.length});}
        if(route==='POST restore'){const r=await restoreBackup(env,email,body.backupKey);return r.status===200?json({saveId:r.saveId,records:r.versions.length}):reply(r.message,r.status);}
        if(route==='POST import'){
          if(!body.state||typeof body.state!=='object')return reply('Invalid backup',400);
          const r=await replaceAll(env,email,body.state,{imported:true});return json({saveId:r.saveId,records:r.versions.length});
        }
        if(route==='POST backup-now'){const r=await runBackup(env,{kind:'manual',by:email});return json(r,r.ok?200:500);}
        return reply('Not found',404);
      });
    }
  }
  return reply('Not found',404);
}

export default {
async fetch(req,env){
  let email;
  try{email=await staffEmail(req,env);}catch{return reply('HD Events HQ · Staff sign-in required',403);}
  const url=new URL(req.url),owner=email===env.OWNER_EMAIL.trim().toLowerCase(),path=url.pathname;

  if(path.startsWith('/api/'))return api(req,env,url,email,owner);
  if(req.method!=='GET')return reply('Not found',404);
  // App code, styles and the logo: any signed-in person may load them (they hold no business data).
  if(path.startsWith('/app/')||path==='/logo.jpg')return env.ASSETS.fetch(req);
  if(path.startsWith('/files/'))return serveFile(env,path);
  if(path!=='/')return reply('Not found',404);

  if(owner){
    if(!await isMigrated(env)){
      const legacy=await legacyState(env);
      if(!legacy)return reply('Workspace setup is incomplete',503);
      return html(upgradePage(counts(legacy.state),!!env.BACKUPS&&!!env.FILES));
    }
    const {state,versions}=await loadState(env);
    const safe=JSON.stringify({state,versions}).replaceAll('<','\\u003c');
    // Map tile servers (OpenStreetMap) require a referrer; send only the site's origin, never the path.
    return reply(template.replace('/*BOOTSTRAP*/null',()=>safe),200,'text/html;charset=utf-8',{'referrer-policy':'strict-origin'});
  }
  const state=await currentState(env);
  if(!state)return reply('Workspace setup is incomplete',503);
  if(!state.staff.some(s=>String(s.email||'').trim().toLowerCase()===email))return reply('Ask Huw to add this email to Staff.',403);
  return html(crewPage(state,email));
},
// Daily backup, set by the cron trigger in wrangler.toml.
async scheduled(event,env,ctx){
  ctx.waitUntil(runBackup(env,{kind:'daily',now:new Date(event.scheduledTime)}));
}
};
