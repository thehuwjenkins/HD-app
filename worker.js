import {staffEmail} from './access.js';
import {validate} from './stock.js';
import template from './owner.html';
import logo from './logo.txt';

const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','strict-transport-security':'max-age=31536000'};
function reply(body,status=200,type='text/plain;charset=utf-8'){return new Response(body,{status,headers:{...headers,'content-type':type}});}
function escapeText(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function crewJobs(state,email){
  const ids=new Set(state.staff.filter(s=>String(s.email||'').trim().toLowerCase()===email).map(s=>String(s.id)));
  return state.jobs.filter(j=>ids.has(String(j.staffId))).map(j=>({title:j.title,venue:j.venue,start:j.start,end:j.end,load:j.load}));
}
export default {async fetch(req,env){
  let email;
  try{email=await staffEmail(req,env);}catch{return reply('HD Events HQ · Staff sign-in required',403);}
  const url=new URL(req.url),owner=email===env.OWNER_EMAIL.trim().toLowerCase();
  if(req.method==='PUT' && url.pathname==='/api/workspace'){
    if(!owner || req.headers.get('origin')!==url.origin)return reply('Forbidden',403);
    if(!req.headers.get('content-type')?.startsWith('application/json'))return reply('JSON required',415);
    const raw=await req.text();
    if(new TextEncoder().encode(raw).length>1800000)return reply('Workspace exceeds this edition’s size limit. Export and contact the owner.',413);
    let data;
    try{data=JSON.parse(raw);if(!Number.isSafeInteger(data.revision))throw Error('Missing revision');validate(data.state);}catch(e){return reply(e.message,422);}
    const result=await env.DB.prepare('UPDATE workspace SET payload=?, revision=revision+1 WHERE id=1 AND revision=?').bind(JSON.stringify(data.state),data.revision).run();
    return result.meta.changes===1?reply(JSON.stringify({revision:data.revision+1}),200,'application/json'):reply('Another device saved first. Reload to review its changes.',409);
  }
  if(req.method!=='GET'||url.pathname!=='/')return reply('Not found',404);
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
}};
