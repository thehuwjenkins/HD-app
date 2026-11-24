// Event planner: plans list, "Plan an Event", and the plan workspace (checklist and safety documents).
// The site map lives in sitemap.js; the creative board and poster studio in creative.js.
let plannerId = null,
  plannerTab = "checklist";
const plannerOpen = new Set(); // checklist items whose details are expanded

const DOC_LABELS = {
  ra: "Risk assessment",
  fra: "Fire risk assessment",
  ms: "Method statement",
  hs: "Event safety management plan",
  evac: "Emergency & evacuation plan",
  medical: "Medical needs assessment",
  crowd: "Crowd management plan",
  traffic: "Traffic management plan",
  noise: "Noise management plan",
  bar: "Bar management plan",
  other: "Document",
};
const DOC_STAGE = { ra: "risk", fra: "risk", ms: "method", hs: "safety", evac: "safety", medical: "safety", crowd: "risk", traffic: "method", noise: "venue", bar: "bars", other: "safety" };
const STATUS_LABELS = { todo: "To do", doing: "In progress", done: "Done", na: "Not needed" };
const currentPlan = () => db.plans.find((p) => p.id === plannerId);
const planJob = (p) => db.jobs.find((j) => j.id === p.jobId);
const approverName = () => String(db.company?.approverName || "").trim();

function planProgress(p) {
  const items = p.stages.flatMap((s) => s.items).filter((i) => i.status !== "na");
  const done = items.filter((i) => i.status === "done").length;
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
}
function nextDue(p) {
  return p.stages
    .flatMap((s) => s.items)
    .filter((i) => i.status !== "done" && i.status !== "na" && i.due)
    .sort((a, b) => a.due.localeCompare(b.due))[0];
}
function countdown(date) {
  if (!date) return "Date not set";
  const n = Math.round((dayMs(date) - dayMs(todayKey())) / DAY);
  return n > 1 ? n + " days to go" : n === 1 ? "Tomorrow!" : n === 0 ? "It's today!" : Math.abs(n) + " days ago";
}
function ring(pct, size = 56) {
  const r = size / 2 - 5,
    c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${pct}% complete"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle">${pct}%</text></svg>`;
}
function toast(msg) {
  document.querySelectorAll(".toast").forEach((t) => t.remove()); // one message at a time
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.innerHTML = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 400);
  }, 3200);
}
function planCover(p) {
  return p.posters?.find((x) => x.exported)?.exported || p.creative?.images?.[0]?.url || "";
}

// ---------- Plans list ----------
function planner() {
  if (currentPlan()) return planWorkspace(currentPlan());
  plannerId = null;
  const plans = [...db.plans].sort((a, b) => (a.eventDate || "9999").localeCompare(b.eventDate || "9999"));
  const cards = plans
    .map((p) => {
      const pr = planProgress(p),
        nd = nextDue(p),
        cover = planCover(p);
      return `<button class="plan-card" onclick="openPlan(${p.id})">
        <div class="plan-cover" ${cover ? `style="background-image:url('${esc(cover)}')"` : ""}>${cover ? "" : "<span>✦</span>"}</div>
        <div class="plan-body">${ring(pr.pct)}<div><b>${esc(p.title)}</b><span class="muted">${p.eventDate ? esc(fmtDay(p.eventDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })) : "Date not set"} · ${countdown(p.eventDate)}</span>
        <span class="muted">${nd ? "Next: " + esc(nd.title) + " · " + fmtDay(nd.due) : pr.total ? "All items done 🎉" : ""}</span></div></div></button>`;
    })
    .join("");
  return `<div class="plan-hero"><div><h2>Plan an event</h2><p>Start from a template, sketch the site on a satellite map, build a moodboard, design the poster, and get every safety document drafted and signed off.</p></div><button class="btn big" onclick="planDialog()">✦ Plan an Event</button></div>
  ${plans.length ? `<div class="plan-grid">${cards}</div>` : '<p class="empty">No event plans yet. Press <b>Plan an Event</b> to start one.</p>'}`;
}
function openPlan(id) {
  plannerId = id;
  plannerTab = "checklist";
  go("Event Planner");
  window.scrollTo(0, 0);
}

// ---------- Plan an Event dialog ----------
function planDialog(jobId) {
  const job = db.jobs.find((j) => j.id === jobId);
  const free = db.jobs.filter((j) => !db.plans.some((p) => p.jobId === j.id) && stageOf(j) !== "invoiced");
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "planDialog";
  root.innerHTML = `<form class="panel" onsubmit="createPlan(event)"><div class="line"><h2 style="margin:0">✦ Plan an Event</h2><button type="button" class="btn small ghost" onclick="$('planDialog').remove()">Close</button></div>
    <div class="form" style="margin-top:14px">
      <label class="wide"><span class="muted">Event name</span><input class="field" name="title" required value="${esc(job?.title || "")}" placeholder="e.g. Aberravon Beach Fest 2027"></label>
      <label><span class="muted">Event date (first show day)</span><input class="field" type="date" name="eventDate" value="${esc(jobDays(job || {})?.[0] || "")}"></label>
      <label><span class="muted">Last day (optional)</span><input class="field" type="date" name="endDate" value="${esc(jobDays(job || {})?.[1] || "")}"></label>
      <label class="wide"><span class="muted">Venue or site address</span><input class="field" name="venue" value="${esc(job?.venue || "")}" placeholder="e.g. Aberavon Beach, Port Talbot"></label>
      <label><span class="muted">Expected capacity</span><input class="field" type="number" min="0" name="capacity" placeholder="e.g. 3000"></label>
      <label><span class="muted">Template</span><select class="field" name="template">${Object.entries(PLAN_TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.name)}</option>`).join("")}</select></label>
      <fieldset class="wide profile-q"><legend>What's happening at this event? <span class="muted">Tick everything that applies. The checklist adds the licences, certificates and safety documents each one needs.</span></legend>
        <div class="profile-grid">${PLAN_PROFILE.map(([k, l, i]) => `<label class="check-card"><input type="checkbox" name="pf_${k}"><span aria-hidden="true">${i}</span> ${esc(l)}</label>`).join("")}</div></fieldset>
      <label class="wide"><span class="muted">Job</span><select class="field" name="jobId"><option value="">Create a new job (as an enquiry)</option>${free.map((j) => `<option value="${j.id}" ${j.id === jobId ? "selected" : ""}>${esc(j.title)} · ${esc(fmtRange(j))}</option>`).join("")}</select><span class="hint">The plan is linked to a job, so kit, crew and the pipeline stay in step.</span></label>
    </div><button class="btn big" type="submit">Create plan</button></form>`;
  document.body.appendChild(root);
  root.querySelector("input[name=title]").focus();
}
function createPlan(e) {
  e.preventDefault();
  const d = data(e);
  const profile = Object.fromEntries(PLAN_PROFILE.map(([k]) => [k, d["pf_" + k] === "on"]));
  let jobId = Number(d.jobId) || null;
  if (!jobId) {
    jobId = uid();
    db.jobs.push({ id: jobId, title: d.title, stage: "enquiry", booking: "Draft", start: d.eventDate || "", end: d.endDate || d.eventDate || "", venue: d.venue, client: "", contact: "", load: "", notes: "", kit: [] });
  }
  const plan = {
    id: uid(),
    jobId,
    title: d.title.trim(),
    eventDate: d.eventDate || "",
    endDate: d.endDate || "",
    venue: d.venue || "",
    capacity: Number(d.capacity) || null,
    template: d.template,
    profile,
    createdAt: new Date().toISOString(),
    stages: planFromTemplate(d.template, d.eventDate, { ...profile, capacity: Number(d.capacity) || 0 }),
    suppliers: [],
    site: { address: d.venue || "", features: [] },
    creative: { theme: "", vibe: "", audience: "", palette: ["#0b1120", "#67d5ed", "#f5b85c", "#ff5d8f"], notes: "", images: [] },
    posters: [],
  };
  db.plans.push(plan);
  save();
  $("planDialog")?.remove();
  toast("✦ Plan created for <b>" + esc(plan.title) + "</b>. Let's build it!");
  openPlan(plan.id);
}

// ---------- Workspace ----------
const PLAN_TABS = [
  ["checklist", "Checklist", "☑"],
  ["site", "Site map", "🗺️"],
  ["creative", "Creative", "🎨"],
  ["posters", "Posters", "🖼️"],
  ["docs", "Safety documents", "📄"],
  ["suppliers", "Suppliers & power", "⚡"],
  ["compliance", "Compliance", "🛡️"],
];
function planWorkspace(p) {
  const pr = planProgress(p),
    job = planJob(p);
  const docs = planDocs(p),
    approved = docs.filter((x) => x.item.doc.status === "approved").length;
  const body = { checklist: planChecklist, site: siteMap, creative: creativeBoard, posters: posterStudio, docs: planDocuments, suppliers: planSuppliers, compliance: planCompliance }[plannerTab] || planChecklist;
  return `<div class="toolbar"><button class="btn small ghost" onclick="plannerId=null;render()">← All plans</button></div>
  <div class="plan-head">${ring(pr.pct, 72)}<div class="grow"><h2>${esc(p.title)}</h2><div class="muted">${p.eventDate ? esc(fmtDay(p.eventDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) : "Date not set"}${p.venue ? " · " + esc(p.venue) : ""}${p.capacity ? " · " + p.capacity.toLocaleString("en-GB") + " capacity" : ""}</div>
  <div class="toolbar" style="margin:8px 0 0">${job ? stageTag(job) + ` <button class="btn small secondary" onclick="openJob(${job.id})">Open job</button>` : ""}<button class="btn small ghost" onclick="editPlanDetails()">Edit details</button><button class="btn small ghost" onclick="profileDialog()">Event profile</button></div></div>
  <div class="countdown"><b>${countdown(p.eventDate)}</b><span>${pr.done} of ${pr.total} done · ${approved}/${docs.length} documents approved</span></div></div>
  <div class="tabs" role="tablist">${PLAN_TABS.map(([k, l, i]) => `<button role="tab" aria-selected="${k === plannerTab}" class="${k === plannerTab ? "active" : ""}" onclick="plannerTab='${k}';render()"><span aria-hidden="true">${i}</span> ${l}</button>`).join("")}</div>
  <div id="planBody">${body(p)}</div>`;
}
function editPlanDetails() {
  const p = currentPlan();
  const title = prompt("Event name", p.title);
  if (title === null || !title.trim()) return;
  const date = prompt("Event date (YYYY-MM-DD)", p.eventDate || "");
  if (date === null) return;
  if (date && !/^\d{4}-\d\d-\d\d$/.test(date)) return alert("Use the format YYYY-MM-DD, e.g. 2027-07-24.");
  const venue = prompt("Venue or site address", p.venue || "");
  if (venue === null) return;
  if (date !== p.eventDate && p.eventDate && date && confirm("Move every checklist deadline by the same number of days as the event date?")) {
    const shift = Math.round((dayMs(date) - dayMs(p.eventDate)) / DAY);
    p.stages.forEach((s) => s.items.forEach((i) => i.due && (i.due = addDays(i.due, shift))));
  }
  Object.assign(p, { title: title.trim(), eventDate: date, venue });
  save();
  render();
}
// Re-draw just the plan (keeps scroll position).
function planRefresh() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

// ---------- Checklist ----------
function findItem(p, id) {
  for (const s of p.stages) {
    const item = s.items.find((i) => i.id === id);
    if (item) return { stage: s, item };
  }
  return {};
}
function planChecklist(p) {
  const today = todayKey();
  const staffNames = [approverName(), ...db.staff.map((m) => m.name)].filter(Boolean);
  return `<datalist id="ownerNames">${staffNames.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>` +
    p.stages
      .map((s) => {
        const live = s.items.filter((i) => i.status !== "na");
        const done = live.filter((i) => i.status === "done").length;
        const pct = live.length ? Math.round((done / live.length) * 100) : 100;
        const items = s.items
          .map((i) => {
            const late = i.due && i.due < today && i.status !== "done" && i.status !== "na";
            const open = plannerOpen.has(i.id);
            return `<div class="item ${i.status}"><div class="item-row">
            <button class="status-btn" data-status="${i.status}" onclick="cycleItem(${i.id})" title="${STATUS_LABELS[i.status]}: click to change" aria-label="${esc(i.title)}: ${STATUS_LABELS[i.status]}">${{ todo: "", doing: "◐", done: "✓", na: "–" }[i.status]}</button>
            <button class="item-title" onclick="toggleItem(${i.id})" aria-expanded="${open}">${esc(i.title)}${i.doc ? ` <span class="tag ${i.doc.status === "approved" ? "success" : "warning"}">${i.doc.status === "approved" ? "Approved" : "Draft: needs review"}</span>` : ""}${i.cert ? ` <span class="tag cert ${i.files?.length ? "success" : ""}" title="Certificate or evidence to file">${i.files?.length ? "📎 Filed" : "Certificate"}</span>` : i.files?.length ? ` <span class="muted">📎${i.files.length}</span>` : ""}</button>
            ${i.owner ? `<span class="chip small">${esc(i.owner)}</span>` : ""}${i.due ? `<span class="tag ${late ? "warning" : ""}">${late ? "Overdue · " : ""}${fmtDay(i.due, { day: "numeric", month: "short" })}</span>` : ""}</div>
            ${open ? itemDetails(p, i) : ""}</div>`;
          })
          .join("");
        return `<details class="stage-box" ${pct < 100 || !live.length ? "open" : ""}><summary><span class="stage-ico" aria-hidden="true">${s.icon}</span><b>${esc(s.name)}</b><span class="muted">${done}/${live.length}</span><span class="bar"><span style="width:${pct}%"></span></span></summary>
        ${items}<form class="add-item" onsubmit="addItem(event,'${s.key}')"><input class="field" name="title" placeholder="+ Add an item to ${esc(s.name)}" aria-label="Add an item to ${esc(s.name)}"><button class="btn small secondary">Add</button></form></details>`;
      })
      .join("");
}
function itemDetails(p, i) {
  const link = { creative: ["🎨 Open creative board", "plannerTab='creative';render()"], posters: ["🖼️ Open poster studio", "plannerTab='posters';render()"], site: ["🗺️ Open site map", "plannerTab='site';render()"], suppliers: ["🤝 Open suppliers & power", "plannerTab='suppliers';render()"], job: ["Open job", `openJob(${p.jobId})`], crosshire: ["Open cross-hire", "go('Cross-hire')"] }[i.link];
  return `<div class="item-details">
    ${i.why ? `<div class="why"><b>Why this matters</b><p>${esc(i.why)}</p></div>` : ""}
    ${i.cert ? `<p class="hint">📎 Attach the certificate or evidence here so it goes into the compliance pack.</p>` : ""}
    <div class="form">
      <label><span class="muted">Status</span><select class="field" onchange="setItem(${i.id},'status',this.value)">${PLAN_STATUSES.map((s) => `<option value="${s}" ${s === i.status ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("")}</select></label>
      <label><span class="muted">Owner</span><input class="field" list="ownerNames" value="${esc(i.owner)}" onchange="setItem(${i.id},'owner',this.value)" placeholder="Who's doing it?"></label>
      <label><span class="muted">Deadline</span><input class="field" type="date" value="${esc(i.due)}" onchange="setItem(${i.id},'due',this.value)"></label>
      <label class="wide"><span class="muted">Notes</span><textarea class="field" rows="3" onchange="setItem(${i.id},'notes',this.value)" placeholder="Contacts, references, decisions…">${esc(i.notes)}</textarea></label>
    </div>
    <div class="files">${(i.files || []).map((f, n) => `<span class="file"><a href="${esc(f.url)}" target="_blank" rel="noopener">📎 ${esc(f.name)}</a> <button class="btn small ghost" onclick="removeItemFile(${i.id},${n})" aria-label="Remove ${esc(f.name)}">×</button></span>`).join("")}</div>
    <div class="toolbar"><button class="btn small secondary" onclick="attachToItem(${i.id})">📎 Attach file</button>${link ? `<button class="btn small secondary" onclick="${link[1]}">${link[0]}</button>` : ""}${i.doc ? `<button class="btn small secondary" onclick="plannerTab='docs';render()">📄 Open document</button>` : ""}<button class="btn small danger" onclick="deleteItem(${i.id})">Delete item</button></div>
  </div>`;
}
function toggleItem(id) {
  plannerOpen.has(id) ? plannerOpen.delete(id) : plannerOpen.add(id);
  planRefresh();
}
function setItem(id, field, value) {
  const p = currentPlan(),
    { stage, item } = findItem(p, id);
  if (!item) return;
  const wasDone = stageComplete(stage);
  item[field] = value;
  save();
  celebrate(p, stage, wasDone);
  planRefresh();
}
function cycleItem(id) {
  const { item } = findItem(currentPlan(), id);
  if (!item) return;
  setItem(id, "status", { todo: "doing", doing: "done", done: "todo", na: "todo" }[item.status]);
}
function stageComplete(s) {
  const live = s.items.filter((i) => i.status !== "na");
  return live.length > 0 && live.every((i) => i.status === "done");
}
function celebrate(p, stage, wasDone) {
  if (!wasDone && stageComplete(stage)) {
    const pr = planProgress(p);
    if (pr.pct === 100) toast("🎉🎉 Everything's done for <b>" + esc(p.title) + "</b>. Have a brilliant event!");
    else toast("🎉 <b>" + esc(stage.name) + "</b> complete! " + pr.pct + "% of the plan done.");
  }
}
function addItem(e, key) {
  e.preventDefault();
  const title = data(e).title.trim();
  if (!title) return;
  const s = currentPlan().stages.find((x) => x.key === key);
  s.items.push({ id: uid(), title, status: "todo", owner: "", due: "", notes: "", files: [] });
  save();
  planRefresh();
}
function deleteItem(id) {
  const p = currentPlan(),
    { stage, item } = findItem(p, id);
  if (!item || !confirm("Delete “" + item.title + "”?" + (item.doc?.content ? " Its document will be deleted too." : ""))) return;
  stage.items = stage.items.filter((i) => i.id !== id);
  save();
  planRefresh();
}
// Pick a file and upload it to file storage. Resolves to {url, name} or null.
function pickFile(accept, kind) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.hidden = true;
    document.body.appendChild(input);
    input.onchange = async () => {
      input.remove();
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      try {
        toast("Uploading " + esc(file.name) + "…");
        resolve({ url: await uploadImage(file, kind), name: file.name });
      } catch (e) {
        alert("Not uploaded. " + e.message);
        resolve(null);
      }
    };
    input.click();
  });
}
async function attachToItem(id) {
  const f = await pickFile(".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,image/*", "plan");
  if (!f) return;
  const { item } = findItem(currentPlan(), id);
  item.files = [...(item.files || []), f];
  save();
  planRefresh();
}
function removeItemFile(id, n) {
  const { item } = findItem(currentPlan(), id);
  if (!confirm("Remove " + item.files[n].name + " from this item?")) return;
  item.files.splice(n, 1);
  save();
  planRefresh();
}

// ---------- Safety documents ----------
const DOC_SKELETONS = {
  ra: "EVENT RISK ASSESSMENT\n\nEvent:\nDate(s):\nSite:\nAssessed by:\n\nHAZARD | WHO MIGHT BE HARMED | EXISTING CONTROLS | LIKELIHOOD x SEVERITY = RISK | FURTHER ACTION | BY WHOM / WHEN\n\n1. \n2. \n3. \n\nReview date:\n",
  fra: "FIRE RISK ASSESSMENT\n\nEvent:\nSite:\nResponsible person:\n\n1. Fire hazards (sources of ignition, fuel, oxygen)\n2. People at risk\n3. Evaluate, remove, reduce, protect\n4. Fire detection and warning\n5. Firefighting equipment and fire points\n6. Escape routes, exits and assembly points\n7. Emergency plan and staff training\n8. Record, review, update\n",
  ms: "METHOD STATEMENT\n\nTask:\nEvent / site:\nSupervisor:\n\nScope of work:\n\nPeople and competence:\n\nEquipment and plant:\n\nSequence of work:\n1. \n2. \n3. \n\nPPE:\n\nHazards and controls (see risk assessment):\n\nEmergency arrangements:\n",
  hs: "EVENT SAFETY MANAGEMENT PLAN\n\n1. Event overview (dates, times, capacity, audience)\n2. Roles and responsibilities\n3. Site plan and layout\n4. Crowd management\n5. Medical and first aid\n6. Fire safety\n7. Emergency and evacuation procedures\n8. Communications\n9. Welfare and accessibility\n10. Build and derig safety\n11. Weather plan\n12. Licensing conditions\n",
  evac: "EMERGENCY AND EVACUATION PLAN\n\nEvent:\nSite:\nEvent safety officer / person in charge:\n\n1. Raising the alarm (who decides, code words, PA message)\n2. Show stop procedure (who can stop the show, script for the stage)\n3. Partial evacuation and full evacuation routes (see site plan)\n4. Exits: number, width and stewarding\n5. Assembly points\n6. Emergency vehicle access routes and rendezvous points (RVPs)\n7. People needing assistance (disabled visitors, children)\n8. Lost children / vulnerable persons during an evacuation\n9. Liaison with police, fire and ambulance\n10. Communications (radio channels, call signs)\n11. Shelter in place / lockdown (severe weather, external threat)\n12. Re-entry and recovery\n",
  medical: "MEDICAL AND FIRST AID NEEDS ASSESSMENT\n\nEvent:\nDate(s) and hours:\nExpected capacity (peak):\nAudience profile (age, alcohol, activities):\n\n1. Event type and risk factors\n2. Distance and journey time to nearest A&E\n3. Provision: first aiders, paramedics, doctors, ambulances\n4. Treatment area location and access\n5. Medical provider (name, CQC registration if applicable)\n6. Communications with event control\n7. Records and patient report forms\n8. Liaison with the local ambulance service\n9. Welfare and drugs/alcohol support\n",
  crowd: "CROWD MANAGEMENT PLAN\n\nEvent:\nSite capacity (calculated):\nPeak expected attendance:\n\n1. Capacity calculation (usable area, density, exit capacity)\n2. Ingress: gates, queueing, searching, ticket checks\n3. Circulation and pinch points\n4. Front of stage arrangements and barriers\n5. Egress: routes, timings, transport\n6. Stewarding plan (numbers, positions, briefings)\n7. Monitoring crowd density and behaviour\n8. Triggers and actions (slow ingress, close areas, show stop)\n9. Communications and PA messages\n",
  traffic: "TRAFFIC MANAGEMENT PLAN\n\nEvent:\nSite:\n\n1. Site access points and routes for traffic\n2. Separation of vehicles and pedestrians\n3. Build and derig vehicle movements, banksmen, site speed limit\n4. Parking (public, crew, traders, accessible parking)\n5. Road closures and signage (highway authority approval)\n6. Emergency vehicle routes (kept clear at all times)\n7. Public transport, taxis and drop-off\n",
  noise: "NOISE MANAGEMENT PLAN\n\nEvent:\nSite:\nHours of amplified sound:\n\n1. Agreed limits (off-site and mix position)\n2. Monitoring positions and who monitors\n3. Speaker system design and orientation\n4. Curfew\n5. Complaints line and response\n6. Staff hearing protection (Noise at Work Regulations 2005)\n",
  bar: "BAR MANAGEMENT PLAN\n\nEvent:\nBar operator:\nPersonal licence holder / DPS:\nLicence or TEN reference:\n\n1. Licensable hours and conditions\n2. Staffing and training (Challenge 21/25, refusals log)\n3. Preventing drunkenness and refusing service\n4. Free drinking water\n5. Drinkware (polycarbonate / plastic) and glass collection\n6. Drink spiking and welfare (Ask for Angela)\n7. Cash handling and security\n8. Cellar, CO2 and gas cylinder safety\n9. Queue management\n10. Closing procedure\n",
  other: "",
};
function planDocs(p) {
  return p.stages.flatMap((s) => s.items.filter((i) => i.doc).map((item) => ({ stage: s, item })));
}
function planDocuments(p) {
  const name = approverName();
  const docs = planDocs(p);
  const banner = name
    ? `<p class="hint">Documents are approved by <b>${esc(name)}</b>. Every draft is marked <b>Draft: needs review</b> until approved, and any change after approval withdraws it.</p>`
    : `<div class="next-action"><div><b>Who approves safety documents?</b><span class="muted">Add the approver's name under Branding → Company details before anything can be approved.</span></div><button class="btn" onclick="go('Branding')">Set approver</button></div>`;
  return (
    banner +
    (docs
      .map(({ item: i }) => {
        const d = i.doc,
          ok = d.status === "approved";
        return `<div class="panel doc ${ok ? "approved" : "draft"}"><div class="line" style="border:0;padding-top:0"><div><span class="muted">${DOC_LABELS[d.kind]}</span><h2 style="margin:0">${esc(i.title)}</h2></div><span class="tag ${ok ? "success" : "warning"}">${ok ? "✓ Approved by " + esc(d.approval.by) + " · " + hqWhen(d.approval.at) : "Draft: needs review"}</span></div>
        ${ok ? `<pre class="doc-text">${esc(d.content)}</pre>` : `<textarea class="field doc-text" rows="14" onchange="setDocText(${i.id},this.value)" aria-label="${esc(i.title)} text">${esc(d.content || DOC_SKELETONS[d.kind])}</textarea>`}
        <div class="toolbar" style="margin-top:10px">${ok ? `<button class="btn small secondary" onclick="unapproveDoc(${i.id})">Edit (withdraws approval)</button>` : `<button class="btn small" onclick="approveDoc(${i.id})" ${name ? "" : "disabled"}>✓ Approve as ${esc(name || "…")}</button><button class="btn small ghost" disabled title="Coming next: Claude drafts this from the event details and your past documents">✨ Draft with AI (coming next)</button>`}<button class="btn small secondary" onclick="printDoc(${i.id})">Print / PDF</button></div></div>`;
      })
      .join("") || '<p class="empty">This plan has no safety documents. Add one from the checklist.</p>') +
    `<div class="toolbar"><button class="btn small secondary" onclick="addDoc()">+ Add a document</button></div>`
  );
}
function setDocText(id, text) {
  const { item } = findItem(currentPlan(), id);
  if (!item?.doc || item.doc.status === "approved") return;
  item.doc.content = text;
  save();
}
function approveDoc(id) {
  const name = approverName();
  const p = currentPlan(),
    { stage, item } = findItem(p, id);
  const area = document.querySelector(`#planBody textarea[aria-label="${CSS.escape(item.title)} text"]`);
  if (area) item.doc.content = area.value;
  if (!name) return alert("Set the approver's name under Branding first.");
  if (!item.doc.content.trim() || item.doc.content === DOC_SKELETONS[item.doc.kind]) return alert("This document is still the blank outline. Fill it in before approving.");
  if (!confirm(`I, ${name}, have reviewed “${item.title}” for ${p.title} and approve it for use.\n\nAny later change will withdraw this approval.`)) return;
  const wasDone = stageComplete(stage);
  item.doc.status = "approved";
  item.doc.approval = { by: name, at: new Date().toISOString(), hash: fingerprint(item.doc.content) };
  item.status = "done";
  save();
  celebrate(p, stage, wasDone);
  toast("✓ <b>" + esc(item.title) + "</b> approved");
  planRefresh();
}
function unapproveDoc(id) {
  const { item } = findItem(currentPlan(), id);
  if (!confirm("Editing withdraws the approval. It will need approving again before use. Continue?")) return;
  item.doc.status = "draft";
  delete item.doc.approval;
  if (item.status === "done") item.status = "doing";
  save();
  planRefresh();
}
function addDoc() {
  const kinds = Object.entries(DOC_LABELS);
  const pick = prompt("Which kind of document?\n" + kinds.map(([, l], n) => n + 1 + ". " + l).join("\n"), "1");
  const kind = kinds[Number(pick) - 1]?.[0];
  if (!kind) return;
  const title = prompt("Title", DOC_LABELS[kind]);
  if (!title) return;
  const p = currentPlan();
  let stage = p.stages.find((s) => s.key === DOC_STAGE[kind]) || p.stages.find((s) => s.key === "safety");
  if (!stage) {
    const [key, name, icon] = PLAN_STAGES.find(([k]) => k === DOC_STAGE[kind]);
    stage = { key, name, icon, items: [] };
    p.stages.push(stage);
  }
  stage.items.push({ id: uid(), title, status: "todo", owner: "", due: "", notes: "", files: [], doc: { kind, content: "", status: "draft" } });
  save();
  planRefresh();
}
function printDoc(id) {
  const p = currentPlan(),
    { item } = findItem(p, id),
    d = item.doc,
    ok = d.status === "approved";
  const w = window.open("", "_blank");
  if (!w) return alert("Allow pop-ups to print this document.");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(item.title)} · ${esc(p.title)}</title><style>body{font:13px/1.5 Arial,sans-serif;color:#111;max-width:780px;margin:30px auto;padding:0 20px}h1{font-size:20px;margin:0}.head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:16px}pre{white-space:pre-wrap;font:inherit}.stamp{border:2px solid ${ok ? "#067647" : "#b42318"};color:${ok ? "#067647" : "#b42318"};padding:10px;margin:16px 0;font-weight:bold}.wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:70px;color:#b4231822;transform:rotate(-20deg);pointer-events:none}@media print{button{display:none}}</style></head><body>
  ${ok ? "" : '<div class="wm">DRAFT</div>'}<button onclick="print()">Print / Save as PDF</button>
  <div class="head"><div><h1>${esc(item.title)}</h1>${esc(DOC_LABELS[d.kind])} · ${esc(p.title)}</div><div>${esc(db.company?.name || "HD Events")}<br>${p.eventDate ? esc(fmtDay(p.eventDate, { day: "numeric", month: "long", year: "numeric" })) : ""}</div></div>
  <div class="stamp">${ok ? "APPROVED by " + esc(d.approval.by) + " on " + esc(hqWhen(d.approval.at)) + " · ref " + esc(d.approval.hash) : "DRAFT: NEEDS REVIEW. Not approved for use."}</div>
  <pre>${esc(d.content || DOC_SKELETONS[d.kind])}</pre></body></html>`);
  w.document.close();
}
