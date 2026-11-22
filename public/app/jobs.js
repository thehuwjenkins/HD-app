function kitRows() {
  return (
    draftKit
      .map(
        (k, n) =>
          `<div class="kit-price-row"><div><b>${esc(k.item)}</b><div class="muted">${esc(k.category || "Audio")}</div></div><label><span class="muted">Qty</span><input class="field" type="number" min="1" value="${k.qty}" onchange="setKitField(${n},'qty',this.value)"></label><label><span class="muted">Unit price (£)</span><input class="field" type="number" min="0" step="0.01" value="${Number(k.price) || 0}" onchange="setKitField(${n},'price',this.value)"></label><div>${money(k.qty * k.price)}</div><button class="btn secondary" type="button" onclick="removeKit(${n})">×</button></div>`,
      )
      .join("") || '<p class="hint">Search and add equipment below, or add a custom labour/install line.</p>'
  );
}
function jobEditor() {
  let j = db.jobs.find((x) => x.id === editingJob) || {};
  return `<div class="panel"><h2>${editingJob ? "Edit job" : "Create job"}</h2><form id="jobForm" class="form" onsubmit="saveJob(event)"><label><div class="muted">Job name</div><input class="field" name="title" required value="${esc(j.title || "")}"></label><label><div class="muted">Linked client</div><select class="field" name="clientId">${clientOptions(j.clientId)}</select><button type="button" class="btn secondary" style="margin-top:8px" onclick="quickClient()">+ New client</button></label><label><div class="muted">Venue / address</div><input class="field" name="venue" value="${esc(j.venue || "")}"></label><label><div class="muted">Staff / crew member</div><select class="field" name="staffId"><option value="">Select staff</option>${db.staff.map((m) => `<option value="${m.id}" ${String(m.id) === String(j.staffId) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label><label><div class="muted">Reservation status</div><select class="field" name="booking">${["Draft", "Reserved", "Returned"].map((v) => "<option " + (v === j.booking ? "selected" : "") + ">" + v + "</option>").join("")}</select></label><label><div class="muted">Prep / allocation start</div><input class="field" type="datetime-local" name="start" required value="${esc(inputTime(j.start, false))}"></label><label><div class="muted">Return date</div><input class="field" type="datetime-local" name="end" required value="${esc(inputTime(j.end, true))}"></label><label class="wide"><div class="muted">Load-in / show schedule</div><input class="field" name="load" value="${esc(j.load || "")}"></label><label class="wide"><div class="muted">Crew / technical notes</div><textarea class="field" name="notes" rows="3">${esc(j.notes || "")}</textarea></label><div class="wide"><h2>Internal equipment & pricing</h2><div id="kitRows">${kitRows()}</div><div class="toolbar" style="margin-top:12px"><input class="field" style="flex:1" id="kitSearch" placeholder="Search equipment e.g. Nexo, XLR, SQ5" oninput="searchKit(this.value)"><select class="field" style="max-width:165px" id="kitCategory">${cats.map((c) => `<option>${c}</option>`).join("")}</select></div><div id="kitResults">${kitResults("")}</div><div class="toolbar"><button class="btn secondary" type="button" onclick="addCustomLine()">+ Add custom cost / labour line</button><select class="field" id="packagePick"><option value="">Choose saved package</option>${db.packages.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select><button class="btn secondary" type="button" onclick="addSelectedPackage()">+ Add package</button></div><label style="display:block;margin:12px 0"><span class="muted">Job discount (£)</span><input class="field" style="max-width:170px" type="number" name="discount" min="0" step="0.01" value="${Number(j.discount) || 0}"></label><div id="quoteTotals">${quoteTotals(draftKit)}</div><p class="hint">Unit prices and individual kit lines stay internal. The client quote shows category totals only.</p></div><div class="wide toolbar"><button class="btn" type="submit">${editingJob ? "Save changes" : "Save job"}</button>${editingJob ? '<button class="btn secondary" type="button" onclick="cancelEdit()">Cancel</button>' : ""}</div></form></div>`;
}
function kitResults(q) {
  let found = db.inventory.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  return `<div class="kit-search-results visual"><div class="equipment-grid">${found.map((i) => equipmentCard(i, true)).join("")}</div>${!found.length ? '<p class="hint">No matching equipment</p>' : ""}</div>`;
}
function searchKit(q) {
  $("kitResults").innerHTML = kitResults(q);
}
function addKitById(id) {
  let i = db.inventory.find((x) => x.id === id);
  if (!i) return;
  let cat = i.category || guessCategory(i.name);
  let existing = draftKit.find((k) => k.item === i.name && k.category === cat);
  if (existing) existing.qty++;
  else draftKit.push({ item: i.name, qty: 1, price: Number(i.price) || 0, category: cat });
  refreshKit();
}
function addCustomLine() {
  let item = prompt("Special-order item / description");
  if (!item) return;
  let price = Number(prompt("Customer hire price per item (£)", "0")) || 0;
  draftKit.push({ item, qty: 1, price, category: guessCategory(item), external: true });
  refreshKit();
}
function setKitField(n, field, value) {
  draftKit[n][field] = field === "qty" ? Math.max(1, Number(value) || 1) : Math.max(0, Number(value) || 0);
  refreshKit();
}
function quoteTotals(lines) {
  let totals = cats.map((c) => ({
    c,
    total: lines
      .filter((k) => (k.category || "Audio") === c)
      .reduce((s, k) => s + (Number(k.qty) || 0) * (Number(k.price) || 0), 0),
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
}
function jobs() {
  return `<div class="job-grid">${jobEditor()}${panel("Saved jobs", db.jobs.length ? db.jobs.map((j) => `<div class="jobcard"><b>${esc(j.title)}</b> <span class="tag">${esc(j.booking)}</span><div class="muted">${esc(j.client || "No client")} · ${esc(j.start)} to ${esc(j.end)}</div><p>${(j.kit || []).length} equipment types · ${(j.kit || []).reduce((n, k) => n + Number(k.qty), 0)} items</p>${jobShortages(j).length ? `<span class="tag warning">${jobShortages(j).length} shortage alert(s)</span>` : '<span class="tag success">No shortages detected</span>'}<div class="jobactions" style="margin-top:12px"><button class="btn secondary" onclick="editJob(${j.id})">Edit kit</button><button class="btn" onclick="printJob(${j.id})">Print job sheet</button><button class="btn secondary" onclick="printQuote(${j.id})">Client quote</button><button class="btn secondary" onclick="crewInviteEditor(${j.id})">Crew invitations</button><button class="btn secondary" onclick="duplicateJob(${j.id})">Duplicate job</button><button class="btn secondary" onclick="deleteJob(${j.id})">Delete</button></div></div>`).join("") : '<div class="empty">Create your first job and add its full equipment list.</div>')}</div>`;
}
function removeKit(n) {
  draftKit.splice(n, 1);
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
  if (d.end < d.start) {
    alert("Return date must be on or after allocation start");
    return;
  }
  if (!draftKit.length) {
    alert("Add at least one equipment item");
    return;
  }
  let j = {
    ...d,
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
  if (editingJob) {
    let i = db.jobs.findIndex((x) => x.id === editingJob);
    db.jobs[i] = { ...db.jobs[i], ...j };
  } else db.jobs.push({ id: uid(), ...j });
  editingJob = null;
  draftKit = [];
  save();
  render();
}
function jobShortages(j) {
  return shortages(j, db);
}
function allShortages() {
  return db.jobs.flatMap((j) =>
    jobShortages(j).map((s) => ({ ...s, job: j.title, start: j.start, end: j.end })),
  );
}
function deleteJob(id) {
  if (!confirm("Remove this demo booking?")) return;
  db.jobs = db.jobs.filter((j) => j.id !== id);
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
  let copy = {
    ...j,
    booking: "Draft",
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
  alert("Job duplicated. Set new allocation dates and save before relying on availability.");
}
function jobValue(j) {
  return Math.max(
    0,
    (j.kit || []).reduce((sum, k) => sum + (Number(k.qty) || 0) * (Number(k.price) || 0), 0) -
      (Number(j.discount) || 0),
  );
}
function renderTurnover() {
  let now = new Date(),
    month = now.toISOString().slice(0, 7);
  let monthJobs = db.jobs.filter((j) => j.start && j.start.slice(0, 7) === month);
  let total = monthJobs.reduce((sum, j) => sum + jobValue(j), 0);
  let name = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  let el = $("turnoverTop");
  if (el)
    el.innerHTML = `<small>Scheduled job value · ${esc(name)}</small><strong>${money(total)}</strong><small>${monthJobs.length} job(s) · excluding VAT · not payments received</small>`;
}
