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
export function validate(state) {
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
    for(const line of job.kit) if(!Number.isSafeInteger(line.qty)||line.qty<1||typeof line.item!=='string')throw Error('Invalid equipment line');
    if(job.booking!=='Reserved') continue;
    const [start,end]=bounds(job);
    if(!(end>start)||!job.kit.length) throw Error('Choose valid reservation times and equipment');
    const issue=shortages(job,state)[0];
    if(issue)throw Error(job.title+' — '+issue.name+' short by '+issue.short+(issue.conflicts.length?' (overlaps '+issue.conflicts.join(', ')+')':''));
  }
}
