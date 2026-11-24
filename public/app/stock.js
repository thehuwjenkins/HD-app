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
// Accessories: items set aside permanently with another item (e.g. an IEC cable kept with a mixing desk).
// Each main unit takes its accessories, so 2 desks with 1 IEC each set aside 2 IECs.
export function allocated(inventory,name){
  let n=0;for(const i of inventory||[])for(const a of i.accessories||[])if(a.item===name)n+=(Number(a.qty)||0)*(Number(i.qty)||0);return n;
}
// Who an item is set aside with, e.g. [{main:'SQ5',qty:1}].
export function allocatedTo(inventory,name){
  const out=[];for(const i of inventory||[])for(const a of i.accessories||[])if(a.item===name)out.push({main:i.name,qty:(Number(a.qty)||0)*(Number(i.qty)||0)});return out;
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
    const owned = item ? item.qty-item.service-allocated(state.inventory,name) : 0;
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
export const DOC_KINDS=['ra','fra','ms','hs','evac','medical','crowd','traffic','noise','bar','other'];
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
    if(p.suppliers!==undefined){
      if(!Array.isArray(p.suppliers))throw Error(p.title+' — suppliers list invalid');
      const sids=new Set();
      for(const s of p.suppliers){
        if(!Number.isSafeInteger(s.id)||sids.has(s.id))throw Error(p.title+' — invalid supplier');
        sids.add(s.id);
        if(typeof s.name!=='string'||!s.name.trim())throw Error(p.title+' — a supplier needs a name');
        if(s.kw!==undefined&&s.kw!==''&&!(Number(s.kw)>=0&&Number(s.kw)<=5000))throw Error(s.name+' — power must be between 0 and 5000 kW');
      }
    }
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
    for(const [f,max] of [['weightKg',5000],['value',1000000],['price',1000000],['lengthCm',2000],['widthCm',2000],['heightCm',2000]])
      if(item[f]!==undefined&&item[f]!==''&&item[f]!==null&&!(Number(item[f])>=0&&Number(item[f])<=max))throw Error(item.name+' — '+(f==='weightKg'?'weight':f)+' must be a number from 0 to '+max);
    if(item.accessories!==undefined){
      if(!Array.isArray(item.accessories))throw Error(item.name+' — invalid accessories');
      const seen=new Set();
      for(const a of item.accessories){
        if(!a||typeof a.item!=='string'||!state.inventory.some(x=>x.name===a.item))throw Error(item.name+' — accessory "'+(a?.item||'')+'" is not in the inventory');
        if(a.item===item.name)throw Error(item.name+' cannot be its own accessory');
        if(seen.has(a.item))throw Error(item.name+' — '+a.item+' is listed twice as an accessory');
        seen.add(a.item);
        if(!Number.isSafeInteger(a.qty)||a.qty<1||a.qty>100)throw Error(item.name+' — accessory quantity must be 1 to 100');
      }
    }
  }
  for(const item of state.inventory){
    const set=allocated(state.inventory,item.name);
    if(set>item.qty-item.service)throw Error(item.name+' — '+set+' set aside as accessories but only '+(item.qty-item.service)+' in service');
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

// ---------- Event power and supplier compliance ----------
// Rough generator sizing from what each supplier says they will plug in. A planning estimate only:
// a competent electrician designs the actual system (BS 7909).
export const GENERATOR_SIZES=[20,30,45,60,100,150,200,250,350,500,800,1000];
export function powerEstimate(suppliers=[],{diversity=0.7,powerFactor=0.8,headroom=1.25}={}){
  const kw=suppliers.reduce((t,s)=>t+(Number(s.kw)>0?Number(s.kw):0),0);
  const threePhase=suppliers.some(s=>s.phase==='3');
  const kva=kw*diversity/powerFactor*headroom;
  const size=kw?GENERATOR_SIZES.find(g=>g>=kva)||null:null;
  // Current per phase: single phase at 230 V, or balanced three phase at 400 V.
  const amps1=Math.round(kw*diversity*1000/230), amps3=Math.round(kw*diversity*1000/(Math.sqrt(3)*400*powerFactor));
  return {kw:Math.round(kw*10)/10, kva:Math.round(kva*10)/10, size, threePhase, amps1, amps3, missing:suppliers.filter(s=>s.needsPower!==false&&!(Number(s.kw)>0)).length};
}
// Which compliance evidence a supplier still owes, as plain-English labels.
export const SUPPLIER_TYPES={av:'AV, lighting & staging',bar:'Bar',food:'Food trader',structure:'Structures & marquees',power:'Power & generators',security:'Security',medical:'Medical',welfare:'Toilets & welfare',other:'Other'};
export function supplierGaps(s,onDate=''){
  const gaps=[], when=onDate||new Date().toISOString().slice(0,10);
  if(!s.pliExpiry)gaps.push('Public liability certificate');
  else if(s.pliExpiry<when)gaps.push('Public liability expired');
  if(!s.ra)gaps.push('Risk assessment');
  if(!s.ms)gaps.push('Method statement');
  if(s.needsPower!==false&&s.type!=='security'&&s.type!=='medical'&&!(Number(s.kw)>0))gaps.push('Power requirement');
  if(s.needsPower!==false&&['av','bar','food','power'].includes(s.type)&&!s.pat)gaps.push('PAT / electrical test records');
  else if(s.pat&&s.pat<addMonths(when,-12))gaps.push('PAT records over 12 months old');
  if(s.type==='food'){
    if(!s.foodReg)gaps.push('Food business registration');
    if(!s.hygiene)gaps.push('Food hygiene rating');
    if(s.gas!==false&&!s.gasCert)gaps.push('Gas safety certificate (LPG)');
  }
  if(s.type==='bar'&&!s.licence)gaps.push('Personal licence holder');
  if(s.type==='structure'&&!s.calcs)gaps.push('Structural calculations / design certificate');
  if(s.type==='power'&&!s.elecCert)gaps.push('Electrical installation certificate (BS 7909)');
  if(s.type==='security'&&!s.sia)gaps.push('SIA licence numbers');
  if(s.type==='medical'&&!s.medPlan)gaps.push('Medical plan / CQC registration');
  return gaps;
}
function addMonths(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,10);}
// ---------- Weights, values and van loads ----------
const num = (v) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : null);
// Totals across the whole inventory. Items without a figure are counted in `missing`.
export function inventoryTotals(inventory=[]){
  let units=0,value=0,weight=0,missingValue=0,missingWeight=0,estValue=0,estWeight=0;
  for(const i of inventory){
    const q=Number(i.qty)||0;units+=q;
    const v=num(i.value),w=num(i.weightKg);
    if(v===null)missingValue++;else{value+=v*q;if(i.valueEst)estValue++;}
    if(w===null)missingWeight++;else{weight+=w*q;if(i.weightEst)estWeight++;}
  }
  return {lines:inventory.length,units,value:Math.round(value*100)/100,weight:Math.round(weight*10)/10,missingValue,missingWeight,estValue,estWeight};
}
// Weight of a job's kit against the payload of the vehicles chosen for it.
export function loadCheck(job,inventory=[],vehicles=[]){
  const byName=new Map(inventory.map(i=>[i.name,i]));
  let kg=0;const unknown=[];
  for(const line of job.kit||[]){
    if(line.category==='Labour / Crew')continue; // people, not kit
    // Accessories travel with their main item, so their weight counts too.
    for(const a of byName.get(line.item)?.accessories||[]){const aw=num(byName.get(a.item)?.weightKg);if(aw!==null)kg+=aw*a.qty*(Number(line.qty)||0);}
    const w=num(line.weightKg??byName.get(line.item)?.weightKg);
    if(w===null){unknown.push(line.item);continue;}
    kg+=w*(Number(line.qty)||0);
  }
  const chosen=vehicles.filter(v=>(job.vehicleIds||[]).map(String).includes(String(v.id)));
  const payload=chosen.reduce((s,v)=>s+(Number(v.payloadKg)||0),0);
  kg=Math.round(kg*10)/10;
  return {kg,unknown,payload,vehicles:chosen.map(v=>v.name),pct:payload?Math.round(kg/payload*100):null,over:payload>0&&kg>payload};
}
// ---------- Van load planner (3D packing) ----------
// Packs a job's kit into a vehicle's load space. Boxes stay upright (they may turn 90° on the floor),
// load from the cab end, biggest and heaviest first, and every box must sit on the floor or on
// stackable boxes covering most of its base. A planning aid: wheel arches and odd shapes are not modelled.
// Units: cm and kg. x = length from the bulkhead, y = across, z = up.
export function loadItems(kit=[],inventory=[]){
  const byName=new Map(inventory.map(i=>[i.name,i]));
  const boxes=[],noSize=[],inside=[];
  for(const line of kit){
    if(line.category==='Labour / Crew')continue;
    const i=byName.get(line.item)||{},qty=Number(line.qty)||0;
    if(i.inCase){inside.push({name:line.item,qty});continue;}
    const l=num(i.lengthCm),w=num(i.widthCm),h=num(i.heightCm);
    if(!(l>0&&w>0&&h>0)){if(qty)noSize.push({name:line.item,qty});continue;}
    for(let n=0;n<qty;n++)boxes.push({name:line.item,l,w,h,kg:num(i.weightKg)||0,stackable:i.stackable!==false});
  }
  return {boxes,noSize,inside};
}
const overlap1=(a0,a1,b0,b1)=>a0<b1-0.01&&b0<a1-0.01;
export function packVehicle(boxes,v,{support=0.75}={}){
  const L=num(v.lengthCm),W=num(v.widthCm),H=num(v.heightCm);
  const placed=[],left=[];
  if(!(L>0&&W>0&&H>0))return {placed,left:boxes.slice(),error:'No load space size for '+v.name};
  // Stackable kit first (biggest, then heaviest), so nothing fragile ends up underneath; non-stackable items go on last.
  const order=boxes.map((b,i)=>({...b,i})).sort((a,b)=>(a.stackable===b.stackable?0:a.stackable?-1:1)||(b.l*b.w*b.h)-(a.l*a.w*a.h)||b.kg-a.kg);
  let points=[[0,0,0]];
  for(const b of order){
    let best=null;
    for(const [x,y,z] of points){
      for(const [l,w] of b.l===b.w?[[b.l,b.w]]:[[b.l,b.w],[b.w,b.l]]){
        if(x+l>L+0.01||y+w>W+0.01||z+b.h>H+0.01)continue;
        if(best&&(x>best.x||(x===best.x&&(z>best.z||(z===best.z&&y>=best.y)))))continue;
        let clash=false;
        for(const p of placed)if(overlap1(x,x+l,p.x,p.x+p.l)&&overlap1(y,y+w,p.y,p.y+p.w)&&overlap1(z,z+b.h,p.z,p.z+p.h)){clash=true;break;}
        if(clash)continue;
        if(z>0){
          let area=0,ok=true;
          for(const p of placed){
            if(Math.abs(p.z+p.h-z)>0.01)continue;
            const ox=Math.min(x+l,p.x+p.l)-Math.max(x,p.x),oy=Math.min(y+w,p.y+p.w)-Math.max(y,p.y);
            if(ox>0&&oy>0){if(!p.stackable){ok=false;break;}area+=ox*oy;}
          }
          if(!ok||area<support*l*w)continue;
        }
        best={x,y,z,l,w};
      }
    }
    if(!best){left.push(b);continue;}
    const p={name:b.name,x:best.x,y:best.y,z:best.z,l:best.l,w:best.w,h:b.h,kg:b.kg,stackable:b.stackable};
    placed.push(p);
    points.push([p.x+p.l,p.y,p.z],[p.x,p.y+p.w,p.z],[p.x,p.y,p.z+p.h]);
    const seen=new Set();
    points=points.filter(([x,y,z])=>{const k=x+','+y+','+z;if(seen.has(k))return false;seen.add(k);
      return !placed.some(q=>x>=q.x-0.01&&x<q.x+q.l-0.01&&y>=q.y-0.01&&y<q.y+q.w-0.01&&z>=q.z-0.01&&z<q.z+q.h-0.01);})
      .sort((a,b)=>a[0]-b[0]||a[2]-b[2]||a[1]-b[1]);
  }
  const vol=placed.reduce((s,p)=>s+p.l*p.w*p.h,0),kg=placed.reduce((s,p)=>s+p.kg,0);
  return {placed,left,volumePct:Math.round(vol/(L*W*H)*100),kg:Math.round(kg*10)/10,payload:num(v.payloadKg)||0,over:!!num(v.payloadKg)&&kg>num(v.payloadKg),
    lengthUsed:placed.reduce((m,p)=>Math.max(m,p.x+p.l),0)};
}
// Fill the chosen vehicles in order; whatever does not fit in one goes on to the next.
export function planLoad(kit,inventory,vehicles){
  const {boxes,noSize,inside}=loadItems(kit,inventory);
  let rest=boxes;const loads=[];
  for(const v of vehicles){const r=packVehicle(rest,v);loads.push({vehicle:v,...r});rest=r.left;}
  return {loads,left:rest,noSize,inside,boxes:boxes.length};
}
// ---------- Inventory import (CSV or tab-separated, e.g. pasted from a spreadsheet or ChatGPT) ----------
export function parseTable(text){
  const t=String(text||'').replace(/^﻿/,'').trim();if(!t)return [];
  const sep=(t.split('\n')[0].match(/\t/g)||[]).length?'\t':',';
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<t.length;i++){
    const c=t[i];
    if(q){if(c==='"'&&t[i+1]==='"'){cell+='"';i++;}else if(c==='"')q=false;else cell+=c;continue;}
    if(c==='"'&&cell==='')q=true;else if(c===sep){row.push(cell);cell='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  row.push(cell);rows.push(row);
  return rows.map(r=>r.map(x=>x.trim())).filter(r=>r.some(Boolean));
}
const IMPORT_COLS=[['name',/^(equipment|item|name|description)/],['category',/^categ/],['qty',/^(owned|qty|quantity)/],['service',/out of service|service/],
  ['lengthCm',/^length/],['widthCm',/^width/],['heightCm',/^height/],['weightEst',/weight.*estim/],['weightKg',/weight/],['valueEst',/value.*estim/],['value',/value|cost|worth/],
  ['price',/hire|price|rate/],['stackable',/stack/],['inCase',/inside|in case/],['notes',/note|source/]];
const yes=v=>/^(y|yes|true|1|x|✓)$/i.test(String(v).trim());
const numIn=v=>{const n=Number(String(v).replace(/[£,\skgcm~]/gi,''));return String(v).trim()!==''&&Number.isFinite(n)?n:undefined;};
// Turn a pasted table into inventory items. Returns {items, skipped, columns}.
export function importRows(text){
  const rows=parseTable(text);if(rows.length<2)return {items:[],skipped:[],columns:[]};
  const head=rows[0].map(h=>h.toLowerCase());
  const map=head.map(h=>{const hit=IMPORT_COLS.find(([,re])=>re.test(h));return hit?hit[0]:null;});
  // Avoid one heading claiming two fields (first match wins).
  const used=new Set();map.forEach((f,i)=>{if(f&&used.has(f))map[i]=null;else if(f)used.add(f);});
  if(!map.includes('name'))throw Error('The first row must be headings, including one called "Equipment" or "Item".');
  const items=[],skipped=[];
  rows.slice(1).forEach((r,n)=>{
    const o={};map.forEach((f,i)=>{if(f&&r[i]!==undefined&&r[i]!=='')o[f]=r[i];});
    if(!o.name||/^total/i.test(o.name)){if(r.some(Boolean)&&!/^total/i.test(o.name||''))skipped.push('Row '+(n+2)+': no equipment name');return;}
    const it={name:o.name.slice(0,120)};
    if(o.category)it.category=o.category;
    for(const f of ['qty','service','lengthCm','widthCm','heightCm','weightKg','value','price']){const v=numIn(o[f]);if(v!==undefined&&v>=0)it[f]=f==='qty'||f==='service'?Math.round(v):v;}
    for(const f of ['weightEst','valueEst','inCase'])if(o[f]!==undefined)it[f]=yes(o[f]);
    if(o.stackable!==undefined&&!yes(o.stackable))it.stackable=false;
    if(o.notes)it.notes=o.notes.slice(0,500);
    items.push(it);
  });
  return {items,skipped,columns:map.filter(Boolean)};
}
// Shared with the browser: the owner page loads this file as a module and uses the same checks.
if (typeof window !== 'undefined') Object.assign(window, {bounds, shortages, validate, STAGES, STAGE_LABELS, STAGE_BOOKING, stageOf, fingerprint, PLAN_STATUSES, DOC_KINDS, allocated, allocatedTo, inventoryTotals, loadCheck, parseTable, importRows, loadItems, packVehicle, planLoad, GENERATOR_SIZES, powerEstimate, SUPPLIER_TYPES, supplierGaps});
