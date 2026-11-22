import {staffEmail} from './access.js';
import {validate} from './stock.js';
import {saveWorkspace,listVersions,listAudit,restore,runBackup,listBackups,status} from './safety.js';
import template from './owner.html';
import logo from './logo.txt';

const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','strict-transport-security':'max-age=31536000',
  // The owner page uses inline scripts, so script-src is left open; these directives block framing, plugins, <base> hijacking and off-site form posts.
  'content-security-policy':"frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'"};
function reply(body,status=200,type='text/plain;charset=utf-8',extra={}){return new Response(body,{status,headers:{...headers,'content-type':type,...extra}});}
const json=(value,status=200)=>reply(JSON.stringify(value),status,'application/json');
const fromResult=r=>r.status===200?json({revision:r.revision}):reply(r.message,r.status);
function escapeText(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function crewJobs(state,email){
  const ids=new Set(state.staff.filter(s=>String(s.email||'').trim().toLowerCase()===email).map(s=>String(s.id)));
  return state.jobs.filter(j=>ids.has(String(j.staffId))).map(j=>({title:j.title,venue:j.venue,start:j.start,end:j.end,load:j.load}));
}
// Writes must come from the owner, from this site, as JSON.
function writeCheck(req,url,owner){
  if(!owner||req.headers.get('origin')!==url.origin)return reply('Forbidden',403);
  if(!req.headers.get('content-type')?.startsWith('application/json'))return reply('JSON required',415);
  return null;
}
async function readJson(req,limit){
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>limit)throw Object.assign(Error('Workspace exceeds this edition’s size limit. Export and contact the owner.'),{status:413});
  return JSON.parse(raw);
}

export default {
async fetch(req,env){
  let email;
  try{email=await staffEmail(req,env);}catch{return reply('HD Events HQ · Staff sign-in required',403);}
  const url=new URL(req.url),owner=email===env.OWNER_EMAIL.trim().toLowerCase(),path=url.pathname;

  if(req.method==='PUT'&&path==='/api/workspace'){
    const denied=writeCheck(req,url,owner);if(denied)return denied;
    let data;
    try{data=await readJson(req,1800000);if(!Number.isSafeInteger(data.revision))throw Error('Missing revision');validate(data.state);}catch(e){return reply(e.message,e.status||422);}
    return fromResult(await saveWorkspace(env,email,data.revision,data.state));
  }
  if(path.startsWith('/api/safety/')){
    if(!owner)return reply('Forbidden',403);
    const route=req.method+' '+path.slice(12);
    if(route==='GET status')return json(await status(env));
    if(route==='GET versions')return json(await listVersions(env));
    if(route==='GET audit')return json(await listAudit(env,Number(url.searchParams.get('limit'))||200));
    if(route==='GET backups')return json(await listBackups(env));
    if(route==='GET download'){
      const key=url.searchParams.get('key')||'';
      if(!env.BACKUPS||!/^(daily|monthly|manual)\/[\w.-]+\.json$/.test(key))return reply('Not found',404);
      const obj=await env.BACKUPS.get(key);if(!obj)return reply('Not found',404);
      return new Response(obj.body,{headers:{...headers,'content-type':'application/json','content-disposition':'attachment; filename="HD_Events_HQ_'+key.replace('/','_')+'"'}});
    }
    if(req.method==='POST'){
      const denied=writeCheck(req,url,owner);if(denied)return denied;
      let body;try{body=await readJson(req,10000);}catch{return reply('Invalid request',400);}
      if(route==='POST restore')return fromResult(await restore(env,email,{versionId:body.versionId,backupKey:body.backupKey}));
      if(route==='POST backup-now'){const r=await runBackup(env,{kind:'manual',by:email});return json(r,r.ok?200:500);}
    }
    return reply('Not found',404);
  }
  if(req.method!=='GET'||path!=='/')return reply('Not found',404);
  const record=await env.DB.prepare('SELECT revision,payload FROM workspace WHERE id=1').first();
  if(!record)return reply('Workspace setup is incomplete',503);
  if(owner){
    const safe=JSON.stringify({revision:record.revision,state:JSON.parse(record.payload)}).replaceAll('<','\\u003c');
    return reply(template.replace('/*BOOTSTRAP*/null',()=>safe),200,'text/html;charset=utf-8');
  }
  const state=JSON.parse(record.payload);
  if(!state.staff.some(s=>String(s.email||'').trim().toLowerCase()===email))return reply('Ask Huw to add this email to Staff.',403);
  const cards=crewJobs(state,email).map(j=>'<article><h2>'+escapeText(j.title)+'</h2><p>'+escapeText(j.venue)+'</p><p>'+escapeText(j.start)+' – '+escapeText(j.end)+'</p><p>'+escapeText(j.load)+'</p></article>').join('');
  return reply('<meta name="viewport" content="width=device-width,initial-scale=1"><title>HD Events HQ · Crew</title><style>body{background:#0b1120;color:#eef4ff;font:17px system-ui;max-width:760px;margin:3rem auto;padding:1rem}img{width:160px}article{background:#152238;padding:1rem 1.5rem;margin:1rem 0;border-radius:12px}a{color:#8fc5ff}</style><img alt="HD Events" src="'+logo+'"><h1>Assigned jobs</h1>'+ (cards||'<p>No jobs assigned.</p>')+'<a href="/cdn-cgi/access/logout">Sign out</a>',200,'text/html;charset=utf-8');
},
// Daily backup, set by the cron trigger in wrangler.toml.
async scheduled(event,env,ctx){
  ctx.waitUntil(runBackup(env,{kind:'daily',now:new Date(event.scheduledTime)}));
}
};
