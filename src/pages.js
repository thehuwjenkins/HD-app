// Server-built pages: the crew portal and the one-off "move to tables" screen.
export function escapeText(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const shell=(title,body)=>'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>body{background:#0b1120;color:#eef4ff;font:17px system-ui;max-width:760px;margin:3rem auto;padding:1rem}img{width:160px}article{background:#152238;padding:1rem 1.5rem;margin:1rem 0;border-radius:12px}a{color:#8fc5ff}table{border-collapse:collapse;width:100%}td,th{padding:6px 10px;border-bottom:1px solid #2a3b54;text-align:left}button{font:inherit;background:#6ad0e6;color:#102033;border:0;border-radius:9px;padding:12px 18px;font-weight:700;cursor:pointer}.bad{color:#ffbb9f}.good{color:#9de4bf}</style></head><body><img alt="HD Events" src="/logo.jpg">'+body+'</body></html>';

export function crewJobs(state,email){
  const ids=new Set(state.staff.filter(s=>String(s.email||'').trim().toLowerCase()===email).map(s=>String(s.id)));
  return state.jobs.filter(j=>ids.has(String(j.staffId))).map(j=>({title:j.title,venue:j.venue,start:j.start,end:j.end,load:j.load}));
}
export function crewPage(state,email){
  const cards=crewJobs(state,email).map(j=>'<article><h2>'+escapeText(j.title)+'</h2><p>'+escapeText(j.venue)+'</p><p>'+escapeText(j.start)+' – '+escapeText(j.end)+'</p><p>'+escapeText(j.load)+'</p></article>').join('');
  return shell('HD Events HQ · Crew','<h1>Assigned jobs</h1>'+(cards||'<p>No jobs assigned.</p>')+'<a href="/cdn-cgi/access/logout">Sign out</a>');
}

const NAMES={jobs:'Jobs',inventory:'Equipment',staff:'Staff',clients:'Contacts',tasks:'Tasks',projects:'Projects',packages:'Packages',crewInvites:'Crew invitations',crossHires:'Cross-hires',quotes:'Quotes'};
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
