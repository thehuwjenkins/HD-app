// One kit line in the job editor.
function kitLine(k, n) {
  return (
          `<div class="kit-line ${isCrewLine(k) ? "crew" : ""} ${k.accessoryOf ? "accessory" : ""}"><div class="kit-line-head"><div><b>${k.accessoryOf ? "↳ " : ""}${esc(k.item)}</b><span class="muted">${isCrewLine(k) ? "Crew" : k.accessoryOf ? "Accessory of " + esc(k.accessoryOf) : esc(k.category || "Audio")}${k.package ? " · in " + esc(k.package) : ""}</span></div><b class="kit-line-total money-only">${money(lineTotal(k))}</b><button class="kit-x" type="button" onclick="removeKit(${n})" aria-label="Remove ${esc(k.item)}">×</button></div>
          <div class="kit-line-fields">${
            isCrewLine(k)
              ? `<label><span class="muted">Crew</span><input class="field" type="number" min="1" value="${k.qty}" onchange="setKitField(${n},'qty',this.value)"></label><label><span class="muted">How long</span><span class="time-unit"><input class="field" type="number" min="0.5" step="0.5" value="${Number(k.time) || 1}" onchange="setKitField(${n},'time',this.value)"><select class="field" onchange="setKitField(${n},'unit',this.value)"><option value="day" ${k.unit !== "hour" ? "selected" : ""}>days</option><option value="hour" ${k.unit === "hour" ? "selected" : ""}>hours</option></select></span></label><label class="money-only"><span class="muted">Rate per ${k.unit === "hour" ? "hour" : "day"} (£)</span><input class="field" type="number" min="0" step="0.01" value="${Number(k.price) || 0}" onchange="setKitField(${n},'price',this.value)"></label>`
              : `<label><span class="muted">Qty</span><input class="field" type="number" min="1" value="${k.qty}" onchange="setKitField(${n},'qty',this.value)"></label><label class="money-only"><span class="muted">Unit price (£)</span><input class="field" type="number" min="0" step="0.01" value="${Number(k.price) || 0}" onchange="setKitField(${n},'price',this.value)"></label>`
          }</div></div>`
  );
}
// Packages show as one line (with their total) that opens to show and edit what's inside.
const pkgOpen = new Set();
function kitRows() {
  if (!draftKit.length) return '<p class="hint">Search and add equipment below, add a package, or add crew.</p>';
  const done = new Set();
  return draftKit
    .map((k, n) => {
      if (!k.pkg) return kitLine(k, n);
      if (done.has(k.pkg)) return "";
      done.add(k.pkg);
      const lines = draftKit.map((x, i) => [x, i]).filter(([x]) => x.pkg === k.pkg);
      const units = lines.reduce((s, [x]) => s + (Number(x.qty) || 0), 0);
      return `<details class="pkg-line" ${pkgOpen.has(k.pkg) ? "open" : ""} ontoggle="this.open ? pkgOpen.add(${k.pkg}) : pkgOpen.delete(${k.pkg})"><summary><div><b>${esc(k.package)}</b><span class="muted">Package · ${units} item${units === 1 ? "" : "s"} · tap to see what's in it</span></div><b class="kit-line-total money-only">${money(lines.reduce((s, [x]) => s + lineTotal(x), 0))}</b><button class="kit-x" type="button" onclick="event.preventDefault();removePackageFromJob(${k.pkg})" aria-label="Remove ${esc(k.package)}">×</button></summary>${lines.map(([x, i]) => kitLine(x, i)).join("")}</details>`;
    })
    .join("");
}
function removePackageFromJob(pkg) {
  draftKit = draftKit.filter((k) => k.pkg !== pkg);
  refreshKit();
}
function jobEditor() {
  let j = db.jobs.find((x) => x.id === editingJob) || {};
  return `<div class="panel" id="jobEditor"><h2>${editingJob ? "Edit job" : "New job"}</h2><form id="jobForm" class="form" onsubmit="saveJob(event)"><label><div class="muted">Job name</div><input class="field" name="title" required value="${esc(j.title || "")}"></label><label><div class="muted">Linked client</div><select class="field" name="clientId">${clientOptions(j.clientId)}</select><button type="button" class="btn secondary" style="margin-top:8px" onclick="quickClient()">+ Create client</button></label><label><div class="muted">Venue / address</div><input class="field" name="venue" value="${esc(j.venue || "")}"></label><label><div class="muted">Staff / crew member</div><select class="field" name="staffId"><option value="">Select staff</option>${db.staff.map((m) => `<option value="${m.id}" ${String(m.id) === String(j.staffId) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label><label><div class="muted">Stage</div><select class="field" name="stage">${STAGES.map((v) => `<option value="${v}" ${v === stageOf(j) ? "selected" : ""}>${STAGE_LABELS[v]}</option>`).join("")}</select><div class="hint">Booked and Out on hire reserve the kit.</div></label><label><div class="muted">Prep / allocation start</div><input class="field" type="datetime-local" name="start" value="${esc(inputTime(j.start, false))}"></label><label><div class="muted">Return date</div><input class="field" type="datetime-local" name="end" value="${esc(inputTime(j.end, true))}"></label><label class="wide"><div class="muted">Load-in / show schedule</div><input class="field" name="load" value="${esc(j.load || "")}"></label><label class="wide"><div class="muted">Crew / technical notes</div><textarea class="field" name="notes" rows="3">${esc(j.notes || "")}</textarea></label><div class="wide"><h2>Internal equipment & pricing</h2><div id="kitRows">${kitRows()}</div><div class="toolbar" style="margin-top:12px"><input class="field" style="flex:1" id="kitSearch" placeholder="Search equipment e.g. Nexo, XLR, SQ5" oninput="searchKit(this.value)"><select class="field" style="max-width:190px" id="kitCategory" aria-label="Filter equipment by category" onchange="searchKit($('kitSearch').value)"><option value="">All categories</option>${inventoryCats().map((c) => `<option>${esc(c)}</option>`).join("")}</select></div><div id="kitResults">${kitResults("")}</div><div class="toolbar"><button class="btn secondary" type="button" onclick="addCrewLine()">+ Add crew</button><button class="btn secondary" type="button" onclick="addCustomLine()">+ Add custom line</button><select class="field" id="packagePick"><option value="">Choose saved package</option>${db.packages.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select><button class="btn secondary" type="button" onclick="addSelectedPackage()">+ Add package</button></div><label class="money-only" style="display:block;margin:12px 0"><span class="muted">Job discount (£)</span><input class="field" style="max-width:170px" type="number" name="discount" min="0" step="0.01" value="${Number(j.discount) || 0}"></label><div id="quoteTotals">${quoteTotals(draftKit)}</div>${vehiclePicker(j)}<div id="loadResult">${loadResult(j.vehicleIds || [])}</div>${vehicleList().length ? `<button type="button" class="btn secondary" style="margin-top:10px" onclick="openLoadPlanner()">Plan the van load</button>` : ""}<p class="hint">Unit prices stay internal: the quote and invoice show a total for each equipment section, and crew itemised (people × days or hours × rate).</p></div><div class="wide toolbar"><button class="btn" type="submit">${editingJob ? "Save changes" : "Save job"}</button>${editingJob ? '<button class="btn ghost" type="button" onclick="cancelEdit()">Cancel</button>' : ""}</div></form></div>`;
}
function kitResults(q) {
  const cat = document.getElementById("kitCategory")?.value || "";
  let found = db.inventory.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()) && (!cat || i.category === cat)).slice(0, 60);
  return `<div class="kit-search-results visual"><div class="equipment-grid">${found.map((i) => equipmentCard(i, true)).join("")}</div>${!found.length ? '<p class="hint">No matching equipment</p>' : ""}</div>`;
}
function searchKit(q) {
  $("kitResults").innerHTML = kitResults(q);
}
function addKitById(id) {
  let i = db.inventory.find((x) => x.id === id);
  if (!i) return;
  let cat = i.category || guessCategory(i.name);
  let existing = draftKit.find((k) => k.item === i.name && k.category === cat && !k.accessoryOf);
  if (existing) existing.qty++;
  else draftKit.push({ item: i.name, qty: 1, price: Number(i.price) || 0, category: cat });
  // Its accessories come too, each as its own priced line (remove any that aren't needed).
  for (const a of i.accessories || []) {
    const ai = db.inventory.find((x) => x.name === a.item);
    if (!ai) continue;
    const line = draftKit.find((k) => k.item === ai.name && k.accessoryOf === i.name);
    if (line) line.qty += a.qty;
    else draftKit.push({ item: ai.name, qty: a.qty, price: Number(ai.price) || 0, category: ai.category || guessCategory(ai.name), accessoryOf: i.name });
  }
  refreshKit();
}
function addCustomLine() {
  let item = prompt("Special-order item / description");
  if (!item) return;
  let price = Number(prompt("Customer hire price per item (£)", "0")) || 0;
  draftKit.push({ item, qty: 1, price, category: guessCategory(item), external: true });
  refreshKit();
}
function addCrewLine() {
  const role = prompt("Crew role (e.g. Sound engineer, Stage hand, Lighting operator)", "Sound engineer");
  if (!role) return;
  draftKit.push({ item: role.trim(), qty: 1, time: 1, unit: "day", price: 0, category: CREW_CAT, external: true });
  refreshKit();
}
function setKitField(n, field, value) {
  if (field === "unit") draftKit[n].unit = value === "hour" ? "hour" : "day";
  else if (field === "time") draftKit[n].time = Math.max(0.5, Number(value) || 1);
  else draftKit[n][field] = field === "qty" ? Math.max(1, Number(value) || 1) : Math.max(0, Number(value) || 0);
  refreshKit();
}
function quoteTotals(lines) {
  let totals = cats.map((c) => ({
    c,
    total: lines
      .filter((k) => (k.category || "Audio") === c)
      .reduce((s, k) => s + lineTotal(k), 0),
  }));
  return `<div class="quote-total"><b>Quote totals (ex VAT)</b>${totals
    .filter((x) => x.total > 0)
    .map((x) => row(esc(x.c), money(x.total)))
    .join(
      "",
    )}<div class="line"><b>Total</b><b>${money(totals.reduce((s, x) => s + x.total, 0))}</b></div></div>`;
}
function refreshKit() {
  $("kitRows").innerHTML = kitRows();
  $("quoteTotals").innerHTML = quoteTotals(draftKit);
  refreshLoad();
}
// ---------- Van load check ----------
function vehiclePicker(j) {
  const list = vehicleList();
  if (!list.length) return `<p class="hint">Add your vans and trailers under Inventory to check the load weight.</p>`;
  const on = (j.vehicleIds || []).map(String);
  return `<div class="vehicle-pick"><span class="muted">Vehicles for this job</span><div class="profile-grid">${list.map((v) => `<label class="check-card small"><input type="checkbox" name="vehicle_${v.id}" ${on.includes(String(v.id)) ? "checked" : ""} onchange="refreshLoad()"> ${esc(v.name)} <span class="muted">(${kg(v.payloadKg)})</span></label>`).join("")}</div></div>`;
}
function chosenVehicles() {
  return [...document.querySelectorAll('#jobForm input[name^="vehicle_"]:checked')].map((x) => Number(x.name.slice(8)));
}
function loadSummary(r) {
  if (!r.kg && !r.unknown.length) return "";
  const missing = r.unknown.length ? `${r.unknown.length} line${r.unknown.length > 1 ? "s" : ""} without a weight (${r.unknown.slice(0, 3).map(esc).join(", ")}${r.unknown.length > 3 ? "…" : ""})` : "";
  if (!r.payload) return `<div class="load-box"><b>Kit weight: ${kg(r.kg)}</b><span class="muted">${missing || "Tick a vehicle to check it fits."}</span></div>`;
  const cls = r.over ? "over" : r.pct >= 90 ? "near" : "ok";
  const msg = r.over ? `Overloaded by ${kg(r.kg - r.payload)}` : r.pct >= 90 ? "Close to the limit" : "Within payload";
  return `<div class="load-box ${cls}"><b>${msg}: ${kg(r.kg)} of ${kg(r.payload)} (${r.pct}%)</b><div class="bar"><span style="width:${Math.min(100, r.pct)}%"></span></div><span class="muted">Payload must also cover crew, fuel and anything else on board.${missing ? " " + missing + "." : ""}</span></div>`;
}
// On first draw use the job's saved vehicles; after that, whatever is ticked on the form.
function loadResult(ids) {
  return loadSummary(loadCheck({ kit: draftKit, vehicleIds: ids }, db.inventory, vehicleList()));
}
function refreshLoad() {
  const el = $("loadResult");
  if (el) el.innerHTML = loadResult(chosenVehicles());
}
let jobFilter = "active",
  jobQuery = "";
function jobs() {
  return `<div class="job-grid">${jobEditor()}<div class="panel"><h2>Jobs</h2><div class="toolbar"><input class="field" style="flex:1;min-width:160px" placeholder="Search jobs, clients, venues…" value="${esc(jobQuery)}" oninput="jobQuery=this.value;$('jobList').innerHTML=jobList()"><select class="field" style="max-width:190px" onchange="jobFilter=this.value;$('jobList').innerHTML=jobList()">${[["active", "Active (not invoiced)"], ["all", "All stages"], ["late", "Late returns"], ...STAGES.map((s) => [s, STAGE_LABELS[s]])].map(([v, l]) => `<option value="${v}" ${v === jobFilter ? "selected" : ""}>${l}</option>`).join("")}</select></div><div id="jobList">${jobList()}</div></div></div>`;
}
function jobList() {
  const q = jobQuery.toLowerCase();
  const list = db.jobs
    .filter((j) => (jobFilter === "all" ? true : jobFilter === "late" ? isLate(j) : jobFilter === "active" ? stageOf(j) !== "invoiced" : stageOf(j) === jobFilter))
    .filter((j) => !q || [j.title, j.client, j.venue].join(" ").toLowerCase().includes(q))
    .sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999"));
  if (!list.length) return db.jobs.length ? '<p class="empty">No jobs match.</p>' : '<p class="empty">Create your first job and add its equipment list.</p>';
  return list
    .map((j) => {
      const issues = jobShortages(j);
      const items = (j.kit || []).reduce((n, k) => n + Number(k.qty), 0);
      return `<div class="jobcard"><div class="head"><div><b>${esc(j.title)}</b><div class="muted">${esc(j.client || "No client")} · ${esc(fmtRange(j))}</div></div>${stageTag(j)}</div>${j.acceptedAt ? `<div class="accepted-line">Accepted ${j.acceptedVia === "client link" ? "online by " + esc(j.acceptedBy) : ""} on ${esc(fmtDay(j.acceptedAt.slice(0, 10), { day: "numeric", month: "short" }))}${j.invoiceNo ? " · Invoice " + esc(j.invoiceNo) : ""}</div>` : j.quoteSentAt && stageOf(j) === "quote" ? `<div class="accepted-line muted">Quote sent ${esc(fmtDay(j.quoteSentAt.slice(0, 10), { day: "numeric", month: "short" }))}${j.quoteToken ? ` · <a href="${esc(clientLink(j))}" target="_blank" rel="noopener">client's quote page</a>` : ""}</div>` : ""}${canWrite("jobs") && nextActions(j) ? `<div class="next-step"><span class="muted">Next step</span>${nextActions(j)}</div>` : ""}${reportsBadge(j) ? `<div class="toolbar" style="margin:6px 0 0">${reportsBadge(j)}</div>` : ""}<p class="muted">${(j.kit || []).length} equipment types · ${items} items · ${money(jobValue(j))}${issues.length ? ` · <span class="tag warning">${issues.length} shortage(s)</span>` : ""}${bookingTag(j) ? " · " + bookingTag(j) : ""}${isLate(j) ? ` · <span class="tag danger-tag">Late return</span>` : ""}${(() => { const l = loadCheck(j, db.inventory, vehicleList()); return l.over ? ` · <span class="tag warning">Overloaded: ${kg(l.kg)} of ${kg(l.payload)}</span>` : l.kg ? ` · ${kg(l.kg)}` : ""; })()}</p><div class="jobactions"><button class="btn small" onclick="editJob(${j.id})">Edit</button>${(() => { const pl = db.plans.find((x) => x.jobId === j.id); return pl ? `<button class="btn small secondary" onclick="openPlan(${pl.id})">Plan</button>` : `<button class="btn small secondary" onclick="planDialog(${j.id})">Plan event</button>`; })()}<button class="btn small secondary" onclick="printJob(${j.id})">Picking list</button>${canWrite("jobs") ? `<button class="btn small secondary" onclick="openBooking(${j.id},'out')">Book out</button><button class="btn small secondary" onclick="openBooking(${j.id},'in')">Book in</button>` : ""}${me.owner ? `<button class="btn small secondary" onclick="printInvoice(${j.id})">${j.invoiceNo ? "Invoice " + esc(j.invoiceNo) : "Invoice"}</button>` : ""}${me.money ? `<button class="btn small secondary" onclick="printQuote(${j.id})">Client quote</button>` : ""}<button class="btn small secondary" onclick="crewInviteEditor(${j.id})">Crew</button><button class="btn small secondary" onclick="duplicateJob(${j.id})">Duplicate</button><button class="btn small danger" onclick="deleteJob(${j.id})">Delete</button></div></div>`;
    })
    .join("");
}
function newJob() {
  editingJob = null;
  draftKit = [];
  go("Jobs");
}
function openJob(id) {
  go("Jobs");
  editJob(id);
}
function removeKit(n) {
  const [gone] = draftKit.splice(n, 1);
  // Removing a main item also removes the accessories that came with it.
  if (gone && !gone.accessoryOf && !draftKit.some((k) => k.item === gone.item && !k.accessoryOf)) draftKit = draftKit.filter((k) => k.accessoryOf !== gone.item);
  refreshKit();
}
function editJob(id) {
  editingJob = id;
  draftKit = (db.jobs.find((j) => j.id === id)?.kit || []).map((k) => ({ ...k }));
  render();
  window.scrollTo(0, 0);
}
function cancelEdit() {
  editingJob = null;
  draftKit = [];
  render();
}
function saveJob(e) {
  e.preventDefault();
  let d = data(e);
  const vehicleIds = Object.keys(d).filter((k) => k.startsWith("vehicle_")).map((k) => Number(k.slice(8)));
  for (const k of Object.keys(d)) if (k.startsWith("vehicle_")) delete d[k];
  d.vehicleIds = vehicleIds;
  if (d.start && d.end && d.end < d.start) {
    alert("Return date must be on or after allocation start");
    return;
  }
  const booking = STAGE_BOOKING[d.stage] || "Draft";
  if (booking === "Reserved" && (!d.start || !d.end)) {
    alert("Set the allocation start and return date before booking the kit.");
    return;
  }
  if (booking === "Reserved" && !draftKit.length) {
    alert("Add at least one equipment item before booking.");
    return;
  }
  let j = {
    ...d,
    booking,
    discount: Math.max(0, Number(d.discount) || 0),
    client: clientName(d.clientId),
    kit: draftKit.map((k) => ({
      ...k,
      qty: Number(k.qty),
      price: Number(k.price) || 0,
      category: k.category || "Audio",
    })),
  };
  if (j.booking === "Reserved") {
    let proposed = { ...j, id: editingJob };
    let [from, to] = bounds(proposed);
    if (!(to > from)) {
      alert("Return must follow collection");
      return;
    }
    let issue = shortages(proposed, db)[0];
    if (issue) {
      alert(issue.name + " short by " + issue.short + " " + issue.conflicts.join(", "));
      return;
    }
  }
  // Changing the Stage box runs the same workflow step as the next-step buttons (dates stamped, invoice
  // created when booked), and the linked event plan picks up the new name, dates and venue.
  const old = editingJob ? db.jobs.find((x) => x.id === editingJob) : null;
  const fromStage = old ? stageOf(old) : "enquiry";
  let saved = old ? { ...old, ...j } : { id: uid(), ...j };
  if (j.stage !== fromStage) saved = stagedJob({ ...saved, stage: fromStage, booking: STAGE_BOOKING[fromStage] }, j.stage);
  if (old) db.jobs[db.jobs.indexOf(old)] = saved;
  else db.jobs.push(saved);
  syncPlanFromJob(old, saved);
  editingJob = null;
  draftKit = [];
  save();
  render();
}
// Keep a job's event plan in step: if the plan still matched the job's old name, dates or venue, it
// follows the change (and its checklist deadlines move with the event date).
function syncPlanFromJob(old, j) {
  const plan = db.plans.find((p) => p.jobId === j.id);
  if (!plan) return;
  const day = (s) => String(s || "").slice(0, 10);
  if (!old || plan.title === old.title) plan.title = j.title;
  if (!old || !plan.venue || plan.venue === (old.venue || "")) plan.venue = j.venue || "";
  if (day(j.start) && (!plan.eventDate || !old || plan.eventDate === day(old.start)) && plan.eventDate !== day(j.start)) {
    if (plan.eventDate) {
      const shift = Math.round((dayMs(day(j.start)) - dayMs(plan.eventDate)) / DAY);
      plan.stages.forEach((s) => s.items.forEach((i) => i.due && (i.due = addDays(i.due, shift))));
    }
    plan.eventDate = day(j.start);
  }
  if (day(j.end) && (!old || !plan.endDate || plan.endDate === day(old.end))) plan.endDate = day(j.end) !== plan.eventDate ? day(j.end) : "";
}
function jobShortages(j) {
  return shortages(j, db);
}
function allShortages() {
  return db.jobs.flatMap((j) =>
    jobShortages(j).map((s) => ({ ...s, job: j.title, jobId: j.id, start: j.start, end: j.end })),
  );
}
function deleteJob(id) {
  const j = db.jobs.find((x) => x.id === id);
  if (!j) return;
  // Everything that belongs to the job goes with it.
  const plan = db.plans.find((p) => p.jobId === id);
  const invites = db.crewInvites.filter((i) => String(i.jobId) === String(id));
  const reports = db.jobReports.filter((r) => String(r.jobId) === String(id));
  const hires = db.crossHires.filter((h) => String(h.jobId) === String(id) || (!h.jobId && h.job === j.title));
  const also = [plan ? `its event plan “${plan.title}”` : "", invites.length ? `${invites.length} crew booking${invites.length > 1 ? "s" : ""}` : "", reports.length ? `${reports.length} crew report${reports.length > 1 ? "s" : ""}` : "", hires.length ? `${hires.length} cross-hire note${hires.length > 1 ? "s" : ""}` : ""].filter(Boolean);
  if (!confirm(`Delete ${j.title}?` + (also.length ? `\n\nThis also deletes ${also.join(", ")}.` : "") + (j.quoteToken ? "\n\nThe client's quote link will stop working." : "") + "\n\nYou can undo this from History & backups.")) return;
  if (plan) db.plans = db.plans.filter((p) => p !== plan);
  db.crewInvites = db.crewInvites.filter((i) => !invites.includes(i));
  db.jobReports = db.jobReports.filter((r) => !reports.includes(r));
  db.crossHires = db.crossHires.filter((h) => !hires.includes(h));
  db.jobs = db.jobs.filter((x) => x.id !== id);
  if (editingJob === id) {
    editingJob = null;
    draftKit = [];
  }
  save();
  render();
}
function duplicateJob(id) {
  let j = db.jobs.find((j) => j.id === id);
  if (!j) return;
  // A fresh enquiry: same kit and details, but none of the original's quote, acceptance or invoice.
  const { quoteToken, quoteSentAt, acceptedAt, acceptedBy, acceptedVia, needsBooking, invoiceNo, invoiceDate, invoiceSentAt, hiredOutAt, returnedAt, invoicedAt, ...rest } = j;
  let copy = {
    ...rest,
    booking: "Draft",
    stage: "enquiry",
    id: uid(),
    title: j.title + " — Copy",
    start: "",
    end: "",
    kit: (j.kit || []).map((k) => ({ ...k })),
  };
  db.jobs.push(copy);
  save();
  editingJob = copy.id;
  draftKit = copy.kit.map((k) => ({ ...k }));
  go("Jobs");
  alert("Job duplicated as a new enquiry. Set the dates before booking.");
}
function jobValue(j) {
  return Math.max(
    0,
    (j.kit || []).reduce((sum, k) => sum + lineTotal(k), 0) -
      (Number(j.discount) || 0),
  );
}
