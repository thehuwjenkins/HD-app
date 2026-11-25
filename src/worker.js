import {staffEmail} from './access.js';
import {applyChanges,undoTo,replaceAll,isMigrated,loadState,currentState,legacyState} from './store.js';
import {listAudit,restoreBackup,runBackup,listBackups,status,counts,BACKUP_KEY} from './safety.js';
import {storeFile,serveFile,MAX_FILE} from './files.js';
import {migrate} from './migrate.js';
import {generateImage} from './ai.js';
import {crewPage,upgradePage} from './pages.js';
import {whoIs,describe,visibleState,prepareChanges,checkAccessSetting} from './roles.js';
import {syncAccess,accessStatus} from './accesssync.js';
import {handleCrew} from './crew.js';
import {handleClientLink} from './clientlink.js';
import {connectRedirect,finishConnect,googleStatus,disconnect,saveToDrive,eventFolderLink} from './google.js';
import {STATIC} from './static.gen.js';
// App code, styles and logo bundled into the worker (see tools/bundle-static.mjs).
function bundled(path){
  const f=Object.hasOwn(STATIC,path)?STATIC[path]:null;
  if(!f)return reply('Not found',404);
  return reply(Uint8Array.from(atob(f.b64),c=>c.charCodeAt(0)),200,f.type,{'cache-control':'private, no-cache'});
}
import template from './owner.html';

const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','strict-transport-security':'max-age=31536000',
  // The owner page uses inline event handlers, so script-src is left open; these directives block framing, plugins, <base> hijacking and off-site form posts.
  'content-security-policy':"frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'"};
function reply(body,status=200,type='text/plain;charset=utf-8',extra={}){return new Response(body,{status,headers:{...headers,'content-type':type,...extra}});}
const json=(value,status=200)=>reply(JSON.stringify(value),status,'application/json');
const html=body=>reply(body,200,'text/html;charset=utf-8');

// Writes must come from someone allowed to make them, from this site.
function writeCheck(req,url,allowed,type='application/json'){
  if(!allowed||req.headers.get('origin')!==url.origin)return reply('Forbidden',403);
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
  const migrated=await isMigrated(env);
  // Crew reports from the "My jobs" page (damage, debrief, photos): checked against the jobs each person is assigned to.
  if(path.startsWith('/api/crew/')){
    if(!migrated)return reply('Not ready',409);
    return guarded(()=>handleCrew(req,env,url,email));
  }
  // Team members may use the data API within their areas; everything else here is the owner's.
  let who={kind:owner?'owner':'none'};
  if(!owner&&migrated)who=whoIs(env,email,(await loadState(env)).state);
  const member=who.kind==='member';
  if(!owner&&!member)return reply('Forbidden',403);
  if(member&&!['/api/changes','/api/files','/api/ai/image','/api/google/status','/api/google/save'].includes(path))return reply('Forbidden',403);

  if(method==='POST'&&path==='/api/migrate'){
    const denied=writeCheck(req,url,owner);if(denied)return denied;
    const r=await migrate(env,email);
    return json(r,r.ok?200:r.status||500);
  }
  if(!migrated)return reply('Storage upgrade needed. Reload the page.',409);

  if(method==='POST'&&path==='/api/changes'){
    const denied=writeCheck(req,url,true);if(denied)return denied;
    return guarded(async()=>{
      let {changes}=await readJson(req,4_000_000);
      if(!Array.isArray(changes))return reply('Invalid change list',422);
      if(member)changes=prepareChanges(changes,(await loadState(env)).state,who);
      for(const ch of changes)if(ch?.collection==='settings'&&ch.id==='access'&&ch.op==='put'){
        try{checkAccessSetting(ch.data,env.OWNER_EMAIL);}catch(e){return reply(e.message,422);}
      }
      const r=await applyChanges(env,email,changes);
      // Adding or removing crew or team members updates who can sign in.
      let access;
      if(changes.some(ch=>ch.collection==='staff'||(ch.collection==='settings'&&ch.id==='access')))access=await syncAccess(env,(await loadState(env)).state);
      return json({versions:r.versions,access});
    });
  }
  if(method==='PUT'&&path==='/api/workspace')return reply('HD Events HQ has been updated. Reload the page; your last change was not saved.',410);
  if(method==='POST'&&path==='/api/files'){
    const type=req.headers.get('content-type')||'';
    const denied=writeCheck(req,url,true,'');if(denied)return denied;
    if(Number(req.headers.get('content-length'))>MAX_FILE)return reply('Files must be under 25 MB.',413);
    return guarded(async()=>json({url:await storeFile(env,url.searchParams.get('kind')||'',type.split(';')[0].trim(),await req.arrayBuffer())}));
  }

  if(method==='POST'&&path==='/api/ai/image'){
    const denied=writeCheck(req,url,owner||who.sections?.includes('planner'));if(denied)return denied;
    return guarded(async()=>{const {prompt}=await readJson(req,10_000);return json({url:await generateImage(env,prompt)});});
  }
  // Google Drive: the owner connects; the owner and team members with the planner or jobs save event documents.
  if(path.startsWith('/api/google/'))return guarded(async()=>{
    if(method==='GET'&&path==='/api/google/connect'&&owner)return connectRedirect(env,url);
    if(method==='GET'&&path==='/api/google/callback'&&owner)return finishConnect(req,env,url,email);
    if(method==='GET'&&path==='/api/google/status'){
      const ref=url.searchParams.get('ref')||'';
      return json({...await googleStatus(env),folderLink:/^(plan|job):\d{1,20}$/.test(ref)?await eventFolderLink(env,ref):''});
    }
    if(method==='POST'&&path==='/api/google/disconnect'){
      const denied=writeCheck(req,url,owner);if(denied)return denied;
      await disconnect(env);return json({ok:true});
    }
    if(method==='POST'&&path==='/api/google/save'){
      const item=await readJson(req,3_500_000);
      const area=String(item?.ref||'').startsWith('job:')?'jobs':'plans';
      const denied=writeCheck(req,url,owner||(member&&(who.write.has(area)||who.write.has('plans'))));if(denied)return denied;
      return json(await saveToDrive(env,item));
    }
    return reply('Not found',404);
  });
  if(method==='GET'&&path==='/api/access/status')return json(await accessStatus(env,(await loadState(env)).state));
  if(method==='POST'&&path==='/api/access/sync'){
    const denied=writeCheck(req,url,owner);if(denied)return denied;
    return json({access:await syncAccess(env,(await loadState(env)).state)});
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

// The full app, with only the data this person may see.
function ownerPage({state,versions},who){
  const safe=JSON.stringify({state,versions,me:describe(who)}).replaceAll('<','\\u003c');
  // Map tile servers (OpenStreetMap) require a referrer; send only the site's origin, never the path.
  return reply(template.replace('/*BOOTSTRAP*/null',()=>safe),200,'text/html;charset=utf-8',{'referrer-policy':'strict-origin'});
}

export default {
async fetch(req,env){
  // Client quote links (/q/<token>) are public: Cloudflare Access bypasses /q, and the random token is the key.
  const path0=new URL(req.url).pathname;
  if(path0==='/q/logo.png'){const r=bundled('/logo-print.png');r.headers.set('cache-control','public, max-age=86400');return r;}
  if(path0.startsWith('/q/'))return handleClientLink(req,env,new URL(req.url));
  let email;
  try{email=await staffEmail(req,env);}
  catch(e){
    // The reason says which check failed (never any token contents), so sign-in problems can be diagnosed.
    console.error('sign-in check failed:',e?.message);
    return reply('HD Events HQ · Staff sign-in required.\n\nThe sign-in pass could not be checked: '+String(e?.message||'unknown').slice(0,120)+'.\nTry signing out at /cdn-cgi/access/logout and in again. If it keeps happening, send this message to Huw.',403);
  }
  const url=new URL(req.url),owner=email===env.OWNER_EMAIL.trim().toLowerCase(),path=url.pathname;

  if(path.startsWith('/api/'))return api(req,env,url,email,owner);
  if(req.method!=='GET')return reply('Not found',404);
  // App code, styles and the logo: any signed-in person may load them (they hold no business data).
  if(path.startsWith('/app/')||path==='/logo.png'||path==='/logo-print.png')return env.ASSETS?env.ASSETS.fetch(req):bundled(path);
  if(path.startsWith('/files/'))return serveFile(env,path);
  if(path!=='/')return reply('Not found',404);

  if(owner){
    if(!await isMigrated(env)){
      const legacy=await legacyState(env);
      if(!legacy)return reply('Workspace setup is incomplete',503);
      return html(upgradePage(counts(legacy.state),!!env.BACKUPS&&!!env.FILES));
    }
    return ownerPage(await loadState(env),{kind:'owner',email});
  }
  if(await isMigrated(env)){
    const full=await loadState(env),who=whoIs(env,email,full.state);
    if(who.kind==='member')return ownerPage(visibleState(full.state,full.versions,who),who);
  }
  const state=await currentState(env);
  if(!state)return reply('Workspace setup is incomplete',503);
  if(!state.staff.some(s=>String(s.email||'').trim().toLowerCase()===email))return reply('This email has not been invited to HD Events HQ. Ask Huw to add you.',403);
  // 'same-origin' referrer policy: the crew page's forms post back here and must carry their origin.
  return reply(crewPage(state,email,undefined,url.searchParams.get('msg')||''),200,'text/html;charset=utf-8',{'referrer-policy':'same-origin'});
},
// Daily backup, set by the cron trigger in wrangler.toml.
async scheduled(event,env,ctx){
  ctx.waitUntil(runBackup(env,{kind:'daily',now:new Date(event.scheduledTime)}));
  // Nightly check that the Cloudflare sign-in list still matches Staff and People & access.
  ctx.waitUntil((async()=>{if(await isMigrated(env))await syncAccess(env,(await loadState(env)).state);})().catch(()=>{}));
}
};
