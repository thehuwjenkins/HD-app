// Server-built pages: the crew portal and the one-off "move to tables" screen.
import {stageOf} from '../public/app/stock.js';
export function escapeText(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const shell=(title,body)=>'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>body{background:#050609;color:#f2f2f0;font:17px \"DM Sans\",Arial,sans-serif;max-width:760px;margin:3rem auto;padding:1rem}img{width:160px}article{background:#0c0d14;border:1px solid #ffffff1c;padding:1rem 1.5rem;margin:1rem 0;border-radius:12px}a{color:#8fc5ff}table{border-collapse:collapse;width:100%}td,th{padding:6px 10px;border-bottom:1px solid #2a3b54;text-align:left}button{font:inherit;background:#f2f2f0;color:#050609;border:0;border-radius:999px;padding:16px 28px;font-weight:700;cursor:pointer}.bad{color:#ffbb9f}.good{color:#9de4bf}</style></head><body><img alt="HD Events" src="/logo.png">'+body+'</body></html>';

// Crew see only the jobs assigned to them, and only these fields (no prices, notes or client details).
export function crewJobs(state,email){
  const ids=new Set(state.staff.filter(s=>String(s.email||'').trim().toLowerCase()===email).map(s=>String(s.id)));
  return state.jobs.filter(j=>ids.has(String(j.staffId))).map(j=>({title:j.title,venue:j.venue,start:j.start,end:j.end,load:j.load,stage:stageOf(j)}));
}
const ukToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date()); // YYYY-MM-DD
const day=s=>/^\d{4}-\d\d-\d\d/.exec(s||'')?.[0]||'';
const fmt=(s,o)=>new Date(day(s)+'T00:00:00Z').toLocaleDateString('en-GB',{timeZone:'UTC',...o});
const time=s=>/T(\d\d:\d\d)$/.exec(s||'')?.[1]||'';
const STATUS={enquiry:['Provisional','prov'],quote:['Provisional','prov'],booked:['Confirmed','conf'],out:['Confirmed','conf'],returned:['Finished','done'],invoiced:['Finished','done']};
function crewCard(j){
  const [label,cls]=STATUS[j.stage];
  const when=day(j.start)?fmt(j.start,{weekday:'long',day:'numeric',month:'long'})+(time(j.start)?' from '+time(j.start):''):'Date to be confirmed';
  const until=day(j.end)&&day(j.end)!==day(j.start)?'Until '+fmt(j.end,{weekday:'short',day:'numeric',month:'short'})+(time(j.end)?' '+time(j.end):''):(time(j.end)?'Until '+time(j.end):'');
  const box=day(j.start)?'<div class="date"><b>'+Number(day(j.start).slice(8))+'</b><span>'+fmt(j.start,{month:'short'})+'</span></div>':'<div class="date"><b>?</b></div>';
  const maps=j.venue?' · <a href="https://www.google.com/maps/search/?api=1&amp;query='+encodeURIComponent(j.venue)+'" target="_blank" rel="noopener">Map</a>':'';
  return '<article>'+box+'<div class="body"><span class="status '+cls+'">'+label+'</span><h2>'+escapeText(j.title)+'</h2><p>'+escapeText(when)+(until?'<br>'+escapeText(until):'')+'</p>'+(j.venue?'<p>📍 '+escapeText(j.venue)+maps+'</p>':'')+(j.load?'<p class="sched">'+escapeText(j.load)+'</p>':'')+'</div></article>';
}
export function crewPage(state,email,today=ukToday()){
  const mine=crewJobs(state,email).sort((a,b)=>(a.start||'9999').localeCompare(b.start||'9999'));
  const name=state.staff.find(s=>String(s.email||'').trim().toLowerCase()===email)?.name;
  const upcoming=mine.filter(j=>!day(j.start)||(day(j.end)||day(j.start))>=today);
  const past=mine.filter(j=>!upcoming.includes(j)).reverse().slice(0,10);
  return crewShell('<h1>'+(name?'Hi '+escapeText(name.split(' ')[0]):'Your jobs')+'</h1><p class="lead">Your upcoming jobs with HD Events.</p>'
    +(upcoming.map(crewCard).join('')||'<p class="none">No upcoming jobs assigned to you.</p>')
    +(past.length?'<details><summary>Recent jobs ('+past.length+')</summary>'+past.map(crewCard).join('')+'</details>':'')
    +'<p class="foot">Questions about a job? Contact Huw. · <a href="/cdn-cgi/access/logout">Sign out</a></p>');
}
const crewShell=body=>'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HD Events · My jobs</title><style>'
  +':root{--bg:#050609;--card:#0c0d14;--line:#ffffff1c;--text:#f2f2f0;--muted:#9c9cab;--accent:#00eeed}*{box-sizing:border-box}body{background:var(--bg);color:var(--text);font:16px/1.5 \"DM Sans\",Arial,sans-serif;margin:0 auto;max-width:640px;padding:16px}'
  +'header img{height:44px;width:auto;display:block}h1{font-size:24px;margin:18px 0 2px}.lead{color:var(--muted);margin:0 0 16px}a{color:#8fddf2}'
  +'article{display:flex;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin:10px 0}.date{flex:0 0 52px;text-align:center;background:linear-gradient(160deg,#00eeed33,#9145ff40);border-radius:10px;padding:8px 0;align-self:flex-start;line-height:1.1}.date b{display:block;font-size:22px}.date span{font-size:11px;color:var(--muted);text-transform:uppercase}'
  +'.body{min-width:0}.body h2{font-size:18px;margin:4px 0}.body p{margin:4px 0;color:#c9d4e6}.sched{background:#0f1828;border-radius:8px;padding:8px 10px;white-space:pre-wrap}'
  +'.status{font-size:12px;font-weight:700;border-radius:20px;padding:2px 9px}.conf{background:#173f35;color:#9de4bf}.prov{background:#3a2f4f;color:#d6c2ff}.done{background:#1d2b45;color:var(--muted)}'
  +'details{margin-top:18px}summary{cursor:pointer;color:var(--muted);padding:8px 0}.none{background:var(--card);border-radius:14px;padding:20px;text-align:center;color:var(--muted)}.foot{color:var(--muted);font-size:14px;margin-top:24px}'
  +'</style><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap"></head><body><header><img alt="HD Events" src="/logo.png"></header>'+body+'</body></html>';

const NAMES={jobs:'Jobs',inventory:'Equipment',staff:'Staff',clients:'Contacts',tasks:'Tasks',projects:'Projects',packages:'Packages',crewInvites:'Crew invitations',crossHires:'Cross-hires',quotes:'Quotes',plans:'Event plans'};
export function upgradePage(counts,ready){
  const rows=Object.entries(counts).map(([k,n])=>'<tr><td>'+NAMES[k]+'</td><td id="b-'+k+'">'+n+'</td><td id="a-'+k+'">–</td></tr>').join('');
  return shell('HD Events HQ · Storage upgrade',`<h1>One-off storage upgrade</h1>
<p>HD Events HQ now stores each job, item and contact as its own record, instead of one large saved file.
This removes the size limit and means each change saves only what changed.</p>
<p>The upgrade copies your records across, then checks every one. Before it starts it takes a verified cloud backup,
and your current saved data is kept exactly as it is. Nothing is deleted.</p>
<table><tr><th>Records</th><th>Now</th><th>After upgrade</th></tr>${rows}</table>
${ready?'<p><button id="go">Upgrade now</button></p>':'<p class="bad">Backups must be switched on first (Phase 1 setup), because the upgrade starts with a safety backup.</p>'}
<p id="msg" role="status"></p>
<script>
document.getElementById('go')?.addEventListener('click',async e=>{
  e.target.disabled=true;const msg=document.getElementById('msg');msg.textContent='Copying and checking records…';
  const res=await fetch('/api/migrate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  const r=await res.json().catch(()=>({ok:false,error:res.statusText}));
  if(r.after)for(const[k,n]of Object.entries(r.after))document.getElementById('a-'+k).textContent=n;
  if(r.ok){msg.className='good';msg.innerHTML='Done. Every record matched. Safety backup: '+r.backup+(r.moved.length?'. Images moved to file storage: '+r.moved.length:'')+'. <a href="/">Open HD Events HQ</a>';}
  else{msg.className='bad';msg.textContent='Upgrade stopped, nothing was switched over: '+r.error;e.target.disabled=false;}
});
</script>`);
}
