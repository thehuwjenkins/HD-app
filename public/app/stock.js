// Stock checks, shared by the server (every save is checked here) and the owner page.
// Job pipeline. Each stage decides whether the job holds stock (the `booking` the shortage checker uses).
export const STAGES=['enquiry','quote','booked','out','returned','invoiced'];
export const STAGE_LABELS={enquiry:'Enquiry',quote:'Quote sent',booked:'Booked',out:'Out on hire',returned:'Returned',invoiced:'Invoiced'};
export const STAGE_BOOKING={enquiry:'Draft',quote:'Draft',booked:'Reserved',out:'Reserved',returned:'Returned',invoiced:'Returned'};
// Jobs saved before the pipeline existed have only `booking`.
export function stageOf(job){return STAGES.includes(job?.stage)?job.stage:({Reserved:'booked',Returned:'returned'})[job?.booking]||'enquiry';}

// Legacy day-only jobs occupy the full return day. New jobs use local depot times.
export function bounds(job) {
  const stamp = (s, end) => {
    if (!/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d)?$/.test(s)) return NaN;
    const t = Date.parse((s.length === 10 ? s + 'T00:00' : s) + ':00Z');
    if (!Number.isFinite(t) || new Date(t).toISOString().slice(0,s.length) !== s) return NaN;
    return t + (end && s.length === 10 ? 86400000 : 0);
  };
  return [stamp(job.start,false),stamp(job.end,true)];
}
export function shortages(job, state) {
  const [start,end] = bounds(job);
  const issues = [];
  const needed = new Map();
  for (const line of job.kit) {
    if (!line.external) needed.set(line.item,(needed.get(line.item)||0)+line.qty);
  }
  for (const [name, quantity] of needed) {
    const item = state.inventory.find(i=>i.name===name);
    const owned = item ? item.qty-item.service : 0;
    const other = state.jobs.filter(j=>j.id!==job.id && j.booking==='Reserved')
      .map(j=>({title:j.title,time:bounds(j),qty:j.kit.filter(k=>!k.external && k.item===name).reduce((n,k)=>n+k.qty,0)}))
      .filter(j=>j.qty && j.time[0]<end && j.time[1]>start);
    let peak = quantity, conflicts = [];
    for(const time of new Set([start,...other.map(j=>Math.max(start,j.time[0]))])) {
      const active = other.filter(j=>j.time[0]<=time && time<j.time[1]);
      const demand = quantity + active.reduce((n,j)=>n+j.qty,0);
      if(demand>peak){peak=demand; conflicts=active.map(j=>j.title);}
    }
    if(peak>owned) issues.push({name,required:peak,owned,short:peak-owned,conflicts});
  }
  return issues;
}
// Short fingerprint of a document's text. An approval stores the fingerprint of the exact text approved,
// so any later edit is detectable and the approval no longer applies.
export function fingerprint(text){
  let h1=0xdeadbeef,h2=0x41c6ce57;
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (4294967296*(2097151&h2)+(h1>>>0)).toString(36);
}
export const PLAN_STATUSES=['todo','doing','done','na'];
export const DOC_KINDS=['ra','fra','ms','hs','other'];
// Event plans: checklist shape, and safety documents can only be "approved" with a named approver
// and an approval that matches the current text.
function validatePlans(plans){
  if(plans===undefined)return;
  if(!Array.isArray(plans))throw Error('Missing plans');
  const ids=new Set();
  for(const p of plans){
    if(!Number.isSafeInteger(p.id)||ids.has(p.id))throw Error('Invalid or duplicate ID in plans');
    ids.add(p.id);
    if(typeof p.title!=='string'||!p.title.trim())throw Error('An event plan needs a name');
    if(!Array.isArray(p.stages))throw Error(p.title+' — checklist missing');
    for(const st of p.stages){
      if(!Array.isArray(st.items))throw Error(p.title+' — checklist stage missing items');
      for(const it of st.items){
        if(!PLAN_STATUSES.includes(it.status))throw Error(p.title+' — invalid checklist status');
        const d=it.doc;
        if(!d)continue;
        if(!DOC_KINDS.includes(d.kind)||typeof d.content!=='string')throw Error(p.title+' — invalid document');
        if(d.status==='approved'){
          const a=d.approval;
          if(!a||typeof a.by!=='string'||!a.by.trim()||typeof a.at!=='string')throw Error(it.title+' — approval needs a named approver');
          if(a.hash!==fingerprint(d.content))throw Error(it.title+' — text changed after approval; it must be approved again');
        }else if(d.status!=='draft')throw Error(p.title+' — invalid document status');
      }
    }
  }
}
export function validate(state) {
  validatePlans(state.plans);
  for(const key of ['jobs','inventory','staff','clients','tasks','projects','packages','crewInvites','crossHires','quotes']) {
    if(!Array.isArray(state[key])) throw Error('Missing '+key);
    const ids = new Set();
    for(const row of state[key]){
      if(!Number.isSafeInteger(row.id)||ids.has(row.id)) throw Error('Invalid or duplicate ID in '+key);
      ids.add(row.id);
    }
  }
  const names = new Set();
  for(const item of state.inventory){
    if(typeof item.name!=='string'||!item.name.trim()||names.has(item.name.toLowerCase())) throw Error('Equipment needs a unique name');
    names.add(item.name.toLowerCase());
    if(!Number.isSafeInteger(item.qty)||!Number.isSafeInteger(item.service)||item.service<0||item.qty<item.service) throw Error('Invalid stock count');
  }
  for(const job of state.jobs){
    if(!['Draft','Reserved','Returned'].includes(job.booking)||!Array.isArray(job.kit)) throw Error('Invalid booking');
    if(job.stage!==undefined&&(!STAGES.includes(job.stage)||STAGE_BOOKING[job.stage]!==job.booking)) throw Error(String(job.title)+' — stage and stock reservation do not match');
    for(const line of job.kit) if(!Number.isSafeInteger(line.qty)||line.qty<1||typeof line.item!=='string')throw Error('Invalid equipment line');
    if(job.booking!=='Reserved') continue;
    const [start,end]=bounds(job);
    if(!(end>start)||!job.kit.length) throw Error('Choose valid reservation times and equipment');
    const issue=shortages(job,state)[0];
    if(issue)throw Error(job.title+' — '+issue.name+' short by '+issue.short+(issue.conflicts.length?' (overlaps '+issue.conflicts.join(', ')+')':''));
  }
}
// Shared with the browser: the owner page loads this file as a module and uses the same checks.
if (typeof window !== 'undefined') Object.assign(window, {bounds, shortages, validate, STAGES, STAGE_LABELS, STAGE_BOOKING, stageOf, fingerprint, PLAN_STATUSES, DOC_KINDS});
