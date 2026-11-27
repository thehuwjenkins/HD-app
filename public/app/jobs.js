// One kit line in the job editor.
function kitLine(k, n) {
  return (
          `<div class="kit-line ${isCrewLine(k) ? "crew" : ""} ${k.accessoryOf ? "accessory" : ""}"><div class="kit-line-head"><div><b>${k.accessoryOf ? "↳ " : ""}${esc(k.item)}</b><span class="muted">${isCrewLine(k) ? "Crew" : k.accessoryOf ? "Accessory of " + esc(k.accessoryOf) : esc(k.category || "Audio")}${k.package ? " · in " + esc(k.package) : ""}${k.included ? " · included free" : ""}</span></div><b class="kit-line-total money-only">${money(lineTotal(k))}</b><button class="kit-x" type="button" onclick="removeKit(${n})" aria-label="Remove ${esc(k.item)}">×</button></div>
          <div class="kit-line-fields">${
            isCrewLine(k)
              ? `<label><span class="muted">Crew</span><input class="field" type="number" min="1" value="${k.qty}" onchange="setKitField(${n},'qty',this.value)"></label><label><span class="muted">How long</span><span class="time-unit"><input class="field" type="number" min="0.5" step="0.5" value="${Number(k.time) || 1}" onchange="setKitField(${n},'time',this.value)"><select class="field" onchange="setKitField(${n},'unit',this.value)"><option value="day" ${k.unit !== "hour" ? "selected" : ""}>days</option><option value="hour" ${k.unit === "hour" ? "selected" : ""}>hours</option></select></span></label><label class="money-only"><span class="muted">Rate per ${k.unit === "hour" ? "hour" : "day"} (£)</span><input class="field" type="number" min="0" step="0.01" value="${Number(k.price) || 0}" onchange="setKitField(${n},'price',this.value)"></label>`
              : `<label><span class="muted">Qty</span><input class="field" type="number" min="1" value="${k.qty}" onchange="setKitField(${n},'qty',this.value)"></label><label class="money-only"><span class="muted">Unit price (£)</span><input class="field" type="number" min="0" step="0.01" value="${Number(k.price) || 0}" onchange="setKitField(${n},'price',this.value)"></label>`
          }</div></div>`
  );
}
// Packages show as one line (with their total) that opens to show and edit what's inside.
const pkgOpen = new Set();
// "This job" in department sections (Audio, Visual, Lighting…), each with its count and subtotal.
// Accessories stay under their main item; packages get their own section; crew go under Crew.
function kitRows() {
  if (!draftKit.length) return '<p class="hint">Add equipment from the list, add a package, or add crew. Items are sorted into their department here.</p>';
  const rows = draftKit.map((k, n) => [k, n]);
  const isMain = (k) => !k.accessoryOf || !draftKit.some((m) => m.item === k.accessoryOf && !m.accessoryOf && !m.pkg);
  const accOf = (k) => rows.filter(([x]) => x.accessoryOf === k.item && !x.pkg && !isMain(x));
  const dept = (k) => (isCrewLine(k) ? "Crew" : k.category || "Audio");
  const groups = new Map();
  for (const [k, n] of rows) {
    if (k.pkg || !isMain(k)) continue;
    const d = dept(k);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push([k, n], ...accOf(k));
  }
  const order = (d) => (d === "Crew" ? 90 : (cats.indexOf(d) + 1 || 80));
  const section = (title, lines, body) => {
    const units = lines.filter(([x]) => !isCrewLine(x)).reduce((s, [x]) => s + (Number(x.qty) || 0), 0);
    const crew = lines.filter(([x]) => isCrewLine(x)).reduce((s, [x]) => s + (Number(x.qty) || 0), 0);
    return `<div class="kit-dept"><div class="kit-dept-head"><b>${esc(title)}</b><span class="muted">${units ? units + " item" + (units === 1 ? "" : "s") : crew + " crew"}</span><b class="money-only">${money(lines.reduce((s, [x]) => s + lineTotal(x), 0))}</b></div>${body}</div>`;
  };
  let html = [...groups].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b)).map(([d, lines]) => section(d, lines, lines.map(([k, n]) => kitLine(k, n)).join(""))).join("");
  // Packages: one section, each package a single line that opens to show what's in it.
  const pkgs = [...new Set(draftKit.filter((k) => k.pkg).map((k) => k.pkg))];
  if (pkgs.length) {
    const all = rows.filter(([k]) => k.pkg);
    html += section(
      "Packages",
      all,
      pkgs
        .map((pkg) => {
          const lines = rows.filter(([x]) => x.pkg === pkg),
            name = lines[0][0].package;
          const units = lines.reduce((s, [x]) => s + (Number(x.qty) || 0), 0);
          return `<details class="pkg-line" ${pkgOpen.has(pkg) ? "open" : ""} ontoggle="this.open ? pkgOpen.add(${pkg}) : pkgOpen.delete(${pkg})"><summary><div><b>${esc(name)}</b><span class="muted">${esc(lines.map(([x]) => x.qty + " × " + x.item + (x.included ? " (free)" : "")).join(", "))} · tap to see</span></div><b class="kit-line-total money-only">${money(lines.reduce((s, [x]) => s + lineTotal(x), 0))}</b><button class="kit-x" type="button" onclick="event.preventDefault();removePackageFromJob(${pkg})" aria-label="Remove ${esc(name)}">×</button></summary>${lines.map(([x, i]) => kitLine(x, i)).join("")}</details>`;
        })
        .join(""),
    );
  }
  return html;
}
function removePackageFromJob(pkg) {
  draftKit = draftKit.filter((k) => k.pkg !== pkg);
  refreshKit();
}
// ---------- Job builder: a full page with three columns ----------
// Left: job details. Middle (largest): all the equipment we own, with what's free on the job's dates.
// Right: this job's list, the quote total, van check and Save.
let jobEditorOpen = false;
function jobEditor() {
  const j = db.jobs.find((x) => x.id === editingJob) || (jobFromTemplate ? { ...jobFromTemplate } : {});
  return `<form id="jobForm" class="job-workspace" onsubmit="saveJob(event)" oninput="if(event.target.name==='start'||event.target.name==='end')refreshKitResults()">
  <div class="jw-top"><button type="button" class="btn small ghost" onclick="cancelEdit()">← All jobs</button><h2>${editingJob ? "Edit job · " + esc(j.title) : jobFromTemplate ? "New job from template · " + esc(jobFromTemplate.name) : "New job"}</h2>${editingJob ? stageTag(j) : ""}<span class="grow"></span>${canWrite("jobTemplates") ? `<button class="btn secondary" type="button" onclick="saveAsTemplate()">Save as template</button>` : ""}<button class="btn secondary" type="button" onclick="cancelEdit()">Cancel</button><button class="btn" type="submit">${editingJob ? "Save changes" : "Save job"}</button></div>
  <section class="jw-details panel"><h3 class="jw-full">Job details</h3>
    <label><span class="muted">Job name</span><input class="field" name="title" required value="${esc(j.title || "")}" placeholder="e.g. Brangwyn Hall awards"></label>
    <label><span class="muted">Client</span><select class="field" name="clientId" onchange="applyClientDefaults(this.value)">${clientOptions(j.clientId)}</select><button type="button" class="btn small secondary" style="margin-top:6px" onclick="quickClient()">+ Create client</button></label>
    <label><span class="muted">Venue / address</span><input class="field" name="venue" value="${esc(j.venue || "")}"></label>
    <label><span class="muted">Collect / prep from</span><input class="field" type="datetime-local" name="start" value="${esc(inputTime(j.start, false))}"></label>
    <label><span class="muted">Return by</span><input class="field" type="datetime-local" name="end" value="${esc(inputTime(j.end, true))}"></label>
    <label><span class="muted">Stage</span><select class="field" name="stage">${STAGES.map((v) => `<option value="${v}" ${v === stageOf(j) ? "selected" : ""}>${STAGE_LABELS[v]}</option>`).join("")}</select><span class="hint">Booked and Out on hire reserve the kit.</span></label>
    <label><span class="muted">Contract the client signs</span><select class="field" name="terms">${[["hire", "Terms of Hire"], ["install", "Installation Agreement"], ["none", "No contract"]].map(([v, l]) => `<option value="${v}" ${v === (j.terms || "hire") ? "selected" : ""}>${l}</option>`).join("")}</select>${j.termsAgreed ? `<span class="hint">Signed by ${esc(j.termsAgreed.name)} · <a href="/q/${esc(j.quoteToken)}/terms" target="_blank" rel="noopener">view</a></span>` : ""}</label>
    <label><span class="muted">Lead crew member</span><select class="field" name="staffId"><option value="">Select staff</option>${db.staff.map((m) => `<option value="${m.id}" ${String(m.id) === String(j.staffId) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>
    <label><span class="muted">Load-in / show schedule</span><input class="field" name="load" value="${esc(j.load || "")}"></label>
    <label class="jw-wide"><span class="muted">Crew / technical notes</span><textarea class="field" name="notes" rows="2">${esc(j.notes || "")}</textarea></label>
  </section>
  <section class="jw-browser panel"><div class="line" style="border:0;padding-top:0"><h3 style="margin:0">Equipment</h3><span class="muted" id="kitDatesNote"></span></div>
    <div class="toolbar"><input class="field" style="flex:1;min-width:180px" id="kitSearch" placeholder="Search everything we own, e.g. Nexo, XLR, SQ5" oninput="searchKit(this.value)"><select class="field" style="max-width:210px" id="kitCategory" aria-label="Filter equipment by category" onchange="searchKit($('kitSearch').value)"><option value="">All categories</option>${inventoryCats().map((c) => `<option>${esc(c)}</option>`).join("")}</select></div>
    <div class="toolbar jw-extras"><select class="field" id="packagePick" style="max-width:260px"><option value="">Add a saved package…</option>${db.packages.map((p) => `<option value="${p.id}">${esc(p.name)}${me.money ? " · " + money(packagePricing(p, db.inventory).price) : ""}</option>`).join("")}</select><button class="btn small secondary" type="button" onclick="addSelectedPackage()">+ Package</button><button class="btn small secondary" type="button" onclick="addCrewLine()">+ Crew</button><button class="btn small secondary" type="button" onclick="addCustomLine()">+ Custom line</button></div>
    <div id="kitResults">${kitResults("")}</div>
  </section>
  <section class="jw-list"><div class="panel jw-sticky"><div class="line" style="border:0;padding-top:0"><h3 style="margin:0">This job</h3><span class="muted" id="kitCount"></span></div>
    <div id="kitRows">${kitRows()}</div>
    <div class="money-only job-money"><label><span class="muted">Discount (£)</span><input class="field" type="number" name="discount" min="0" step="0.01" value="${Number(j.discount) || 0}" oninput="refreshKit()"></label><label><span class="muted">Discount %</span><input class="field" type="number" name="discountPct" min="0" max="100" step="0.5" value="${jobDefault(j, "discountPct")}" oninput="refreshKit()"></label><label><span class="muted">Deposit %</span><input class="field" type="number" name="depositPct" min="0" max="100" step="5" value="${jobDefault(j, "depositPct")}"></label></div>
    <div id="quoteTotals">${quoteTotals(draftKit)}</div>
    ${vehiclePicker(j)}<div id="loadResult">${loadResult(j.vehicleIds || [])}</div>${vehicleList().length ? `<button type="button" class="btn small secondary" style="margin-top:10px" onclick="openLoadPlanner()">Plan the van load</button>` : ""}
    <p class="hint">Unit prices stay internal: quotes and invoices show a total per equipment section, with crew itemised.</p>
    <button class="btn big" type="submit" style="width:100%">${editingJob ? "Save changes" : "Save job"}</button></div></section>
  </form>`;
}
// The job as it stands in the form (for availability on its dates).
function draftJob() {
  const f = document.getElementById("jobForm");
  const j = db.jobs.find((x) => x.id === editingJob) || {};
  return { ...j, id: editingJob ?? -1, start: f?.elements.start?.value || j.start || "", end: f?.elements.end?.value || j.end || "", kit: draftKit };
}
function kitResults(q) {
  const cat = document.getElementById("kitCategory")?.value || "";
  const job = draftJob();
  const dated = bounds(job)[0] < bounds(job)[1];
  const found = db.inventory
    .filter((i) => i.name.toLowerCase().includes(String(q).toLowerCase()) && (!cat || i.category === cat))
    .sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
  if (!found.length) return `<p class="empty">${db.inventory.length ? "No equipment matches." : "No equipment yet: add it under Inventory."}</p>`;
  let lastCat = null;
  return `<div class="kit-browser">${found
    .map((i) => {
      const onJob = draftKit.filter((k) => k.item === i.name).reduce((n, k) => n + (Number(k.qty) || 0), 0);
      const free = freeFor(job, db, i.name);
      const left = free - onJob;
      const head = i.category !== lastCat ? `<div class="kb-cat">${esc((lastCat = i.category) || "Other")}</div>` : "";
      return `${head}<div class="kb-row ${onJob ? "on-job" : ""}"><div class="kb-name"><b>${esc(i.name)}</b><span class="muted">${me.money ? money(i.price) + " · " : ""}${weightText(i)}${i.accessories?.length ? " · with accessories" : ""}${onJob ? ` · <span class="kb-on">${onJob} on this job</span>` : ""}</span></div>
        <span class="kb-free ${left < 0 ? "short" : left === 0 ? "none" : ""}" title="${dated ? "Free on this job's dates" : "Not booked out right now (set dates to check them)"}">${left < 0 ? `${-left} short` : `${left} ${dated ? "free" : "available"}`}</span>
        <div class="kb-add"><input class="field" type="number" min="1" value="1" id="kbq_${i.id}" aria-label="How many ${esc(i.name)}"><button type="button" class="btn small" onclick="addKitById(${i.id},Number($('kbq_${i.id}').value)||1)">Add</button></div></div>`;
    })
    .join("")}</div>`;
}
function searchKit(q) {
  $("kitResults").innerHTML = kitResults(q);
}
function refreshKitResults() {
  const el = $("kitResults");
  if (el) el.innerHTML = kitResults($("kitSearch")?.value || "");
  const note = $("kitDatesNote");
  if (note) {
    const j = draftJob();
    note.textContent = bounds(j)[0] < bounds(j)[1] ? "Showing what's free on this job's dates" : "Set the dates to see what's free then";
  }
}
function addKitById(id, qty = 1) {
  let i = db.inventory.find((x) => x.id === id);
  if (!i) return;
  qty = Math.max(1, Math.round(Number(qty) || 1));
  let cat = i.category || guessCategory(i.name);
  let existing = draftKit.find((k) => k.item === i.name && k.category === cat && !k.accessoryOf && !k.pkg);
  if (existing) existing.qty += qty;
  else draftKit.push({ item: i.name, qty, price: Number(i.price) || 0, category: cat });
  // Its accessories come too, each as its own priced line (remove any that aren't needed).
  for (const a of i.accessories || []) {
    const ai = db.inventory.find((x) => x.name === a.item);
    if (!ai) continue;
    const line = draftKit.find((k) => k.item === ai.name && k.accessoryOf === i.name);
    if (line) line.qty += a.qty * qty;
    else draftKit.push({ item: ai.name, qty: a.qty * qty, price: Number(ai.price) || 0, category: ai.category || guessCategory(ai.name), accessoryOf: i.name });
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
// Discount % and deposit % for the job form: the job's own, else (new jobs) the client's or the company default.
function jobDefault(j, f) {
  if (j[f] !== undefined && j[f] !== "") return Number(j[f]) || 0;
  if (editingJob) return 0;
  const c = db.clients.find((x) => String(x.id) === String(j.clientId));
  if (c && hasNum(c[f])) return Number(c[f]);
  return f === "depositPct" && hasNum(db.company?.depositPct) ? Number(db.company.depositPct) : 0;
}
// Choosing a client fills in their standing discount and deposit (you can still change them).
function applyClientDefaults(id) {
  const f = $("jobForm"), c = db.clients.find((x) => String(x.id) === String(id));
  if (!f || !c) return;
  if (hasNum(c.discountPct)) f.discountPct.value = Number(c.discountPct);
  if (hasNum(c.depositPct)) f.depositPct.value = Number(c.depositPct);
  else if (hasNum(db.company?.depositPct)) f.depositPct.value = Number(db.company.depositPct);
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
    )}${(() => {
      const f = $("jobForm"), q = quoteSummary({ kit: lines, discount: f ? Number(f.discount?.value) || 0 : 0, discountPct: f ? Number(f.discountPct?.value) || 0 : 0 }, { vatRegistered: !!db.company?.vatNumber });
      return (q.discount ? row("Discount", "−" + money(q.discount)) : "") + `<div class="line"><b>Total${q.vat ? " inc VAT" : ""}</b><b>${money(q.gross)}</b></div>`;
    })()}</div>`;
}
function refreshKit() {
  $("kitRows").innerHTML = kitRows();
  $("quoteTotals").innerHTML = quoteTotals(draftKit);
  refreshLoad();
  refreshKitResults(); // "on job" and "free" figures in the equipment list follow the job's list
  const c = $("kitCount");
  if (c) {
    const n = draftKit.filter((k) => !isCrewLine(k)).reduce((s, k) => s + (Number(k.qty) || 0), 0);
    c.textContent = n ? n + " item" + (n === 1 ? "" : "s") : "";
  }
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
  jobQuery = "",
  jobPay = "";
const jobPayStatus = (j) => (!j.invoiceNo ? "Not invoiced" : payStatus(j).status);
// The jobs shown: the stage tab, the search box and (money only) the payment status filter.
function filteredJobs() {
  const q = jobQuery.toLowerCase();
  return jobsIn(jobFilter)
    .filter((j) => !q || [j.title, j.client, j.venue, j.invoiceNo].join(" ").toLowerCase().includes(q))
    .filter((j) => !jobPay || !me.money || jobPayStatus(j) === jobPay)
    .sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999"));
}
function refreshJobList() {
  $("jobList").innerHTML = jobList();
  $("jobTiles").innerHTML = jobTiles();
}
function jobTiles() {
  const list = filteredJobs();
  const items = list.reduce((n, j) => n + (j.kit || []).filter((k) => !isCrewLine(k)).reduce((m, k) => m + (Number(k.qty) || 0), 0), 0);
  const tile = (l, v) => `<div><span class="muted">${l}</span><b>${v}</b></div>`;
  return `<div class="job-tiles">${tile("Jobs", list.length)}${tile("Items", items)}${me.money ? tile("Value", money(list.reduce((s, j) => s + quoteSummary(j, payOpts()).gross, 0))) + tile("Amount due", money(list.filter((j) => j.invoiceNo).reduce((s, j) => s + payStatus(j).due, 0))) : ""}</div>`;
}
// Spreadsheet of the jobs currently shown.
function exportJobsCsv() {
  const cell = (v) => {
    let t = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // keep spreadsheet formulas out
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const head = ["Job", "Client", "Venue", "Start", "End", "Stage", "Items", ...(me.money ? ["Total", "Invoice", "Payment status", "Paid", "Due"] : [])];
  const rows = filteredJobs().map((j) => {
    const ps = me.money ? payStatus(j) : null;
    return [j.title, j.client, j.venue, j.start, j.end, STAGE_LABELS[stageOf(j)], (j.kit || []).filter((k) => !isCrewLine(k)).reduce((m, k) => m + (Number(k.qty) || 0), 0), ...(me.money ? [ps.total.toFixed(2), j.invoiceNo || "", jobPayStatus(j), ps.paid.toFixed(2), j.invoiceNo ? ps.due.toFixed(2) : ""] : [])];
  });
  const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
  a.download = `hd-events-jobs-${todayKey()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function jobs() {
  if (jobEditorOpen) return jobEditor();
  const tabsRow = [["active", "Active"], ["upcoming", "Upcoming"], ["late", "Late"], ["shortage", "With shortage"], ["all", "All"]];
  return `<div class="panel jobs-page"><div class="jobs-head"><h2 style="margin:0">Jobs</h2><input class="field" placeholder="Search jobs, clients, venues…" value="${esc(jobQuery)}" oninput="jobQuery=this.value;refreshJobList()"><select class="field" aria-label="Stage" onchange="jobFilter=this.value;render()">${[["active", "Active (not finished)"], ["upcoming", "Upcoming (today on)"], ["all", "All jobs"], ["late", "Late returns"], ["shortage", "With shortage"], ...(me.money ? [["unpaid", "Invoices unpaid"]] : []), ...STAGES.map((s) => [s, STAGE_LABELS[s]])].map(([v, l]) => `<option value="${v}" ${v === jobFilter ? "selected" : ""}>${l} (${jobsIn(v).length})</option>`).join("")}</select>${me.money ? `<select class="field" aria-label="Payment status" onchange="jobPay=this.value;refreshJobList()"><option value="">Any payment status</option>${["Not invoiced", ...PAYMENT_STATUSES.filter((x) => x !== "No charge")].map((v) => `<option ${v === jobPay ? "selected" : ""}>${v}</option>`).join("")}</select>` : ""}${canWrite("jobs") && db.jobTemplates.length ? `<select class="field" style="max-width:240px" aria-label="New job from a template" onchange="if(this.value)newJobFromTemplate(Number(this.value))"><option value="">New job from template…</option>${db.jobTemplates.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select>` : ""}${canWrite("jobs") ? `<button class="btn" onclick="newJob()">+ New job</button>` : ""}</div>
    <div class="job-tabs" role="tablist">${tabsRow.map(([v, l]) => `<button role="tab" class="${v === jobFilter ? "active" : ""}" aria-selected="${v === jobFilter}" onclick="jobFilter='${v}';render()">${l} <span>${jobsIn(v).length}</span></button>`).join("")}<button class="btn small secondary" style="margin-left:auto" onclick="exportJobsCsv()">Export CSV</button></div>
    <div id="jobTiles">${jobTiles()}</div>${templateList()}<div id="jobList" class="job-cards">${jobList()}</div></div>`;
}
// The jobs in a Jobs-list filter: a stage, "active", "all" or "late". Uses the same stage the workflow sets.
function jobsIn(filter) {
  const today = todayKey();
  return db.jobs.filter((j) =>
    filter === "all" ? true
    : filter === "late" ? isLate(j)
    : filter === "shortage" ? ["enquiry", "quote", "booked", "out"].includes(stageOf(j)) && jobShortages(j).length > 0
    : filter === "upcoming" ? !(jobDays(j)?.[1] || jobDays(j)?.[0]) || (jobDays(j)?.[1] || jobDays(j)?.[0]) >= today
    : filter === "unpaid" ? !!j.invoiceSentAt && !j.paidAt
    : filter === "active" ? stageOf(j) !== "invoiced" || (!!j.invoiceSentAt && !j.paidAt)
    : stageOf(j) === filter,
  );
}
function jobList() {
  const list = filteredJobs();
  if (!list.length) return db.jobs.length ? '<p class="empty">No jobs match.</p>' : '<p class="empty">Create your first job and add its equipment list.</p>';
  return list
    .map((j) => {
      const issues = jobShortages(j);
      const items = (j.kit || []).reduce((n, k) => n + Number(k.qty), 0);
      return `<div class="jobcard"><div class="head"><div><b>${esc(j.title)}</b><div class="muted">${esc(j.client || "No client")} · ${esc(fmtRange(j))}</div></div>${stageTag(j)}</div>${j.acceptedAt ? `<div class="accepted-line">Accepted ${j.acceptedVia === "client link" ? "online by " + esc(j.acceptedBy) : ""} on ${esc(fmtDay(j.acceptedAt.slice(0, 10), { day: "numeric", month: "short" }))}${j.invoiceNo ? " · Invoice " + esc(j.invoiceNo) + (me.money ? ` · <a href="#" onclick="openPayments(${j.id});return false">${esc(payStatus(j).status === "Paid" ? "Paid" : payStatus(j).status + (j.invoiceSentAt ? "" : " (invoice not sent)"))} · payments</a>` : j.paidAt ? " paid" : j.invoiceSentAt ? " sent, awaiting payment" : " not sent yet") : ""}</div>` : j.quoteSentAt && stageOf(j) === "quote" ? `<div class="accepted-line muted">Quote sent ${esc(fmtDay(j.quoteSentAt.slice(0, 10), { day: "numeric", month: "short" }))}${j.quoteToken ? ` · <a href="${esc(clientLink(j))}" target="_blank" rel="noopener">client's quote page</a>` : ""}</div>` : ""}${canWrite("jobs") && nextActions(j) ? `<div class="next-step"><span class="muted">Next step</span>${nextActions(j)}</div>` : ""}${(() => { const inv = db.crewInvites.filter((i) => String(i.jobId) === String(j.id)); if (!inv.length) return ""; const st = (i) => (i.status === "Accepted" ? "accepted" : i.status === "Declined" ? "declined" : i.status === "Invited" ? "invited" : "not sent"); return `<div class="crew-line">Crew: ${inv.map((i) => `<span class="crew-${st(i).replace(" ", "-")}">${esc(db.staff.find((m) => String(m.id) === String(i.staffId))?.name || "?")} (${st(i)})</span>`).join(", ")}</div>`; })()}${reportsBadge(j) ? `<div class="toolbar" style="margin:6px 0 0">${reportsBadge(j)}</div>` : ""}<p class="muted">${(j.kit || []).length} equipment types · ${items} items · ${money(jobValue(j))}${issues.length ? ` · <span class="tag warning">${issues.length} shortage(s)</span>` : ""}${bookingTag(j) ? " · " + bookingTag(j) : ""}${isLate(j) ? ` · <span class="tag danger-tag">Late return</span>` : ""}${(() => { const l = loadCheck(j, db.inventory, vehicleList()); return l.over ? ` · <span class="tag warning">Overloaded: ${kg(l.kg)} of ${kg(l.payload)}</span>` : l.kg ? ` · ${kg(l.kg)}` : ""; })()}</p><div class="jobactions"><button class="btn small" onclick="editJob(${j.id})">Edit</button>${(() => { const pl = db.plans.find((x) => x.jobId === j.id); return pl ? `<button class="btn small secondary" onclick="openPlan(${pl.id})">Plan</button>` : `<button class="btn small secondary" onclick="planDialog(${j.id})">Plan event</button>`; })()}<button class="btn small secondary" onclick="printJob(${j.id})">Picking list</button>${canWrite("jobs") ? `<button class="btn small secondary" onclick="openBooking(${j.id},'out')">Book out</button><button class="btn small secondary" onclick="openBooking(${j.id},'in')">Book in</button>` : ""}${me.owner ? `<button class="btn small secondary" onclick="sendToClient(${j.id},'invoice')">${j.invoiceNo ? "Send invoice " + esc(j.invoiceNo) : "Send invoice"}</button>` : ""}${me.money ? `<button class="btn small secondary" onclick="sendToClient(${j.id},'quote')">Send quote</button>` : ""}<button class="btn small secondary" onclick="crewInviteEditor(${j.id})">Crew</button>${driveButtons("job:" + j.id, `saveJobToDrive(${j.id})`)}<button class="btn small secondary" onclick="duplicateJob(${j.id})">Duplicate</button>${canWrite("jobTemplates") ? `<button class="btn small secondary" onclick="templateFromJob(${j.id})">Save as template</button>` : ""}<button class="btn small danger" onclick="deleteJob(${j.id})">Delete</button></div></div>`;
    })
    .join("");
}
function newJob() {
  editingJob = null;
  jobFromTemplate = null;
  draftKit = [];
  jobEditorOpen = true;
  go("Jobs");
  window.scrollTo(0, 0);
  refreshKitResults();
}
function openJob(id) {
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
  jobEditorOpen = true;
  if (tab !== "Jobs") go("Jobs");
  else render();
  window.scrollTo(0, 0);
  refreshKitResults();
}
function cancelEdit() {
  editingJob = null;
  jobFromTemplate = null;
  draftKit = [];
  jobEditorOpen = false;
  render();
  window.scrollTo(0, 0);
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
    discountPct: Math.min(100, Math.max(0, Number(d.discountPct) || 0)),
    depositPct: Math.min(100, Math.max(0, Number(d.depositPct) || 0)),
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
  jobEditorOpen = false;
  editingJob = null;
  jobFromTemplate = null;
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
  const { quoteToken, quoteSentAt, acceptedAt, acceptedBy, acceptedVia, needsBooking, invoiceNo, invoiceDate, invoiceSentAt, hiredOutAt, returnedAt, invoicedAt, paidAt, movements, payments, cardSessions, termsAgreed, ...rest } = j;
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
  jobEditorOpen = true;
  go("Jobs");
  refreshKitResults();
  alert("Job duplicated as a new enquiry. Set the dates before booking.");
}
function jobValue(j) {
  return Math.max(
    0,
    (j.kit || []).reduce((sum, k) => sum + lineTotal(k), 0) -
      (Number(j.discount) || 0),
  );
}

// ---------- Job templates ----------
// A template keeps a job's kit, crew lines, client, venue, lead crew, schedule and notes, but no dates,
// stage, quote, invoice or booking history. "New job from template" opens the job builder pre-filled.
let jobFromTemplate = null;
const TEMPLATE_FIELDS = ["title", "clientId", "client", "venue", "staffId", "load", "notes", "discount", "discountPct", "depositPct", "vehicleIds", "terms"];
function templateData(src, kit) {
  const t = {};
  for (const f of TEMPLATE_FIELDS) if (src[f] !== undefined && src[f] !== "") t[f] = src[f];
  t.kit = (kit || []).map(({ pkg, ...k }) => ({ ...k, qty: Number(k.qty) || 1, ...(pkg ? { pkg } : {}) }));
  return t;
}
function storeTemplate(t) {
  const name = prompt("Name this template (e.g. Small PA wedding, Conference day):", t.title || "");
  if (!name || !name.trim()) return;
  const existing = db.jobTemplates.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
  if (existing && !confirm(`There's already a template called "${existing.name}". Replace it?`)) return;
  if (existing) Object.assign(existing, t, { name: name.trim(), updatedAt: new Date().toISOString() });
  else db.jobTemplates.push({ id: uid(), name: name.trim(), ...t, createdAt: new Date().toISOString() });
  save();
  render();
  toast(`Template "${name.trim()}" saved`);
}
function templateFromJob(id) {
  const j = db.jobs.find((x) => x.id === id);
  if (j) storeTemplate(templateData(j, j.kit));
}
// From the job builder: whatever is in the form right now, even before the job is saved.
function saveAsTemplate() {
  const f = document.getElementById("jobForm");
  const d = Object.fromEntries(new FormData(f));
  d.vehicleIds = Object.keys(d).filter((k) => k.startsWith("vehicle_")).map((k) => Number(k.slice(8)));
  d.client = clientName(d.clientId);
  d.discount = Math.max(0, Number(d.discount) || 0);
  if (!draftKit.length && !confirm("This job has no equipment yet. Save the template anyway?")) return;
  storeTemplate(templateData(d, draftKit));
}
function newJobFromTemplate(id) {
  const t = db.jobTemplates.find((x) => x.id === id);
  if (!t) return;
  editingJob = null;
  // Package lines get a fresh group id so two jobs from one template never share a package instance.
  const ids = {};
  draftKit = (t.kit || []).map((k) => ({ ...k, ...(k.pkg ? { pkg: (ids[k.pkg] ??= uid() + Object.keys(ids).length) } : {}) }));
  const known = (k) => k.external || isCrewLine(k) || db.inventory.some((i) => i.name === k.item);
  const missing = draftKit.filter((k) => !known(k)).map((k) => k.item);
  jobFromTemplate = { ...t, stage: "enquiry", clientId: db.clients.some((c) => String(c.id) === String(t.clientId)) ? t.clientId : "" };
  jobEditorOpen = true;
  go("Jobs");
  window.scrollTo(0, 0);
  refreshKitResults();
  if (missing.length) alert("These items in the template are no longer in the inventory: " + missing.join(", ") + ". Remove or replace them before booking.");
}
function templateList() {
  if (!db.jobTemplates.length) return "";
  const w = canWrite("jobTemplates");
  return `<details class="templates"><summary>Job templates (${db.jobTemplates.length})</summary>${db.jobTemplates
    .map((t) => `<div class="line"><div><b>${esc(t.name)}</b><div class="muted">${(t.kit || []).length} line${(t.kit || []).length === 1 ? "" : "s"}${t.venue ? " · " + esc(t.venue) : ""}${t.client ? " · " + esc(t.client) : ""}</div></div><div class="toolbar" style="margin:0">${canWrite("jobs") ? `<button class="btn small" onclick="newJobFromTemplate(${t.id})">New job from this</button>` : ""}${w ? `<button class="btn small secondary" onclick="renameTemplate(${t.id})">Rename</button><button class="btn small danger" onclick="deleteTemplate(${t.id})">Delete</button>` : ""}</div></div>`)
    .join("")}<p class="hint">To change what's in a template, start a job from it, change the kit, then use Save as template with the same name.</p></details>`;
}
function renameTemplate(id) {
  const t = db.jobTemplates.find((x) => x.id === id);
  const name = prompt("New name for this template:", t.name);
  if (!name || !name.trim()) return;
  t.name = name.trim();
  save();
  render();
}
function deleteTemplate(id) {
  const t = db.jobTemplates.find((x) => x.id === id);
  if (!confirm(`Delete the template "${t.name}"?\n\nJobs already made from it are not affected.`)) return;
  db.jobTemplates = db.jobTemplates.filter((x) => x.id !== id);
  save();
  render();
}
