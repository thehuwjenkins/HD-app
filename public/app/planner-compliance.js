// Event planner: event profile, suppliers & power, and the compliance pack.
// The power figures are a planning estimate only; a competent electrician designs the system (BS 7909).

const SUPPLIER_CHECKS = [
  // [field, label, kind, shown for types (empty = all)]
  ["pliExpiry", "Public liability expires", "date", []],
  ["ra", "Risk assessment received", "check", []],
  ["ms", "Method statement received", "check", []],
  ["pat", "PAT / test records dated", "date", ["av", "bar", "food", "power", "other", "structure", "welfare"]],
  ["foodReg", "Food business registered", "check", ["food"]],
  ["hygiene", "Food hygiene rating (0 to 5)", "text", ["food"]],
  ["gasCert", "LPG gas safety certificate", "check", ["food"]],
  ["licence", "Personal licence holder named", "check", ["bar"]],
  ["calcs", "Structural calcs / design certificate", "check", ["structure"]],
  ["elecCert", "BS 7909 electrical certificate", "check", ["power"]],
  ["sia", "SIA licence numbers received", "check", ["security"]],
  ["medPlan", "Medical plan / CQC registration", "check", ["medical"]],
];

// ---------- Event profile ----------
function profileDialog() {
  const p = currentPlan(),
    pf = p.profile || {};
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "profileDialog";
  root.innerHTML = `<form class="panel" onsubmit="saveProfile(event)"><div class="line"><h2 style="margin:0">Event profile</h2><button type="button" class="btn small ghost" onclick="$('profileDialog').remove()">Close</button></div>
    <p class="hint">Tick everything that applies. New ticks add the checklist items they need. Unticking never deletes anything: mark those items "Not needed" instead.</p>
    <label><span class="muted">Expected capacity (peak, including staff)</span><input class="field" type="number" min="0" name="capacity" value="${esc(p.capacity || "")}"></label>
    <div class="profile-grid">${PLAN_PROFILE.map(([k, l, i]) => `<label class="check-card"><input type="checkbox" name="pf_${k}" ${pf[k] ? "checked" : ""}><span aria-hidden="true">${i}</span> ${esc(l)}</label>`).join("")}</div>
    <button class="btn big" type="submit">Save and update checklist</button></form>`;
  document.body.appendChild(root);
}
function saveProfile(e) {
  e.preventDefault();
  const d = data(e),
    p = currentPlan();
  p.profile = Object.fromEntries(PLAN_PROFILE.map(([k]) => [k, d["pf_" + k] === "on"]));
  p.capacity = Number(d.capacity) || null;
  const added = mergeTemplate(p);
  save();
  $("profileDialog")?.remove();
  toast(added ? `✦ Added <b>${added}</b> checklist item${added > 1 ? "s" : ""} for this event's profile` : "Event profile saved. Nothing new to add.");
  planRefresh();
}
// Add template items this plan is missing (matched by title), keeping everything already there.
function mergeTemplate(p) {
  const fresh = planFromTemplate(p.template, p.eventDate, { ...(p.profile || {}), capacity: p.capacity || 0 });
  const have = new Set(p.stages.flatMap((s) => s.items.map((i) => i.title.toLowerCase())));
  let added = 0;
  for (const fs of fresh) {
    let stage = p.stages.find((s) => s.key === fs.key);
    const missing = fs.items.filter((i) => !have.has(i.title.toLowerCase()));
    if (!missing.length) continue;
    if (!stage) {
      stage = { key: fs.key, name: fs.name, icon: fs.icon, items: [] };
      const order = PLAN_STAGES.map(([k]) => k);
      const at = p.stages.findIndex((s) => order.indexOf(s.key) > order.indexOf(fs.key));
      at < 0 ? p.stages.push(stage) : p.stages.splice(at, 0, stage);
    }
    missing.forEach((i) => stage.items.push({ ...i, id: uid() }));
    added += missing.length;
  }
  return added;
}

// ---------- Suppliers & power ----------
const supplierOpen = new Set();
const supplierById = (p, id) => (p.suppliers || []).find((s) => s.id === id);
function planSuppliers(p) {
  p.suppliers ||= [];
  const pw = powerEstimate(p.suppliers);
  const due = p.eventDate || todayKey();
  const rows = p.suppliers
    .map((s) => {
      const gaps = supplierGaps(s, due);
      const checks = SUPPLIER_CHECKS.filter(([, , , types]) => !types.length || types.includes(s.type))
        .map(([f, l, kind]) =>
          kind === "check"
            ? `<label class="check-card small"><input type="checkbox" ${s[f] ? "checked" : ""} onchange="setSupplier(${s.id},'${f}',this.checked)"> ${esc(l)}</label>`
            : `<label><span class="muted">${esc(l)}</span><input class="field" type="${kind}" value="${esc(s[f] || "")}" onchange="setSupplier(${s.id},'${f}',this.value)"></label>`,
        )
        .join("");
      return `<details class="panel supplier" ${supplierOpen.has(s.id) ? "open" : ""} ontoggle="this.open ? supplierOpen.add(${s.id}) : supplierOpen.delete(${s.id})"><summary class="line" style="border:0;padding:0"><div><b>${esc(s.name)}</b> <span class="muted">${esc(SUPPLIER_TYPES[s.type] || "Other")}${Number(s.kw) > 0 ? " · " + Number(s.kw) + " kW" : ""}</span></div>
        <span class="tag ${gaps.length ? "warning" : "success"}">${gaps.length ? gaps.length + " missing" : "✓ Compliant"}</span></summary>
        ${gaps.length ? `<p class="hint">Still needed: ${gaps.map(esc).join(" · ")}</p>` : ""}
        <div class="form">
          <label><span class="muted">Name</span><input class="field" value="${esc(s.name)}" onchange="setSupplier(${s.id},'name',this.value)"></label>
          <label><span class="muted">Type</span><select class="field" onchange="setSupplier(${s.id},'type',this.value)">${Object.entries(SUPPLIER_TYPES).map(([k, l]) => `<option value="${k}" ${k === s.type ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
          <label><span class="muted">Contact (name, phone, email)</span><input class="field" value="${esc(s.contact || "")}" onchange="setSupplier(${s.id},'contact',this.value)"></label>
          <label><span class="muted">Power needed (kW)</span><input class="field" type="number" min="0" step="0.1" value="${esc(s.kw ?? "")}" onchange="setSupplier(${s.id},'kw',this.value)" placeholder="e.g. 3.5"><span class="hint">Add up the watts on each appliance's plate ÷ 1000. A kettle is 3 kW, a fryer 6 to 9 kW.</span></label>
          <label><span class="muted">Supply</span><select class="field" onchange="setSupplier(${s.id},'phase',this.value)"><option value="1" ${s.phase !== "3" ? "selected" : ""}>Single phase (16A / 32A)</option><option value="3" ${s.phase === "3" ? "selected" : ""}>Three phase</option></select></label>
          <label class="check-card small"><input type="checkbox" ${s.needsPower === false ? "checked" : ""} onchange="setSupplier(${s.id},'needsPower',!this.checked)"> No power needed</label>
          ${s.type === "food" ? `<label class="check-card small"><input type="checkbox" ${s.gas === false ? "checked" : ""} onchange="setSupplier(${s.id},'gas',!this.checked)"> No gas (LPG) on this unit</label>` : ""}
          ${checks}
          <label class="wide"><span class="muted">Notes</span><textarea class="field" rows="2" onchange="setSupplier(${s.id},'notes',this.value)">${esc(s.notes || "")}</textarea></label>
        </div>
        <div class="files">${(s.files || []).map((f, n) => `<span class="file"><a href="${esc(f.url)}" target="_blank" rel="noopener">📎 ${esc(f.name)}</a> <button class="btn small ghost" onclick="removeSupplierFile(${s.id},${n})" aria-label="Remove ${esc(f.name)}">×</button></span>`).join("")}</div>
        <div class="toolbar"><button class="btn small secondary" onclick="attachToSupplier(${s.id})">📎 Attach certificate</button><button class="btn small danger" onclick="deleteSupplier(${s.id})">Remove supplier</button></div></details>`;
    })
    .join("");
  const power = pw.kw
    ? `<div class="power-grid"><div><span class="muted">Total connected load</span><b>${pw.kw} kW</b></div><div><span class="muted">Estimated demand (70% diversity, +25% headroom)</span><b>${pw.kva} kVA</b></div><div><span class="muted">Suggested generator</span><b>${pw.size ? pw.size + " kVA" : "Over 1000 kVA: specialist"}</b></div><div><span class="muted">Approx. current</span><b>${pw.threePhase || pw.amps1 > 63 ? pw.amps3 + " A per phase (3-phase)" : pw.amps1 + " A single phase"}</b></div></div>
      ${pw.missing ? `<p class="hint">⚠️ ${pw.missing} supplier${pw.missing > 1 ? "s haven't" : " hasn't"} given a power figure yet, so the total is low.</p>` : ""}
      <p class="hint">A planning estimate to start the conversation with your power supplier. Distribution, cable sizes, earthing and RCD protection must be designed and signed off by a competent electrician to BS 7909. Motor loads (fridges, compressors, fryers) can need extra starting capacity.</p>`
    : `<p class="hint">Add each supplier's power needs to size the generator.</p>`;
  return `<div class="panel"><h2 style="margin-top:0">⚡ Power</h2>${power}</div>
    <div class="line" style="border:0"><h2 style="margin:0">Suppliers, traders & contractors</h2><button class="btn" onclick="addSupplier()">+ Add supplier</button></div>
    <p class="hint">For each supplier, collect insurance, a risk assessment, a method statement and any trade certificates before they arrive on site.</p>
    ${rows || '<p class="empty">No suppliers yet. Add your bars, food traders, staging, power, security and medical providers.</p>'}`;
}
function addSupplier() {
  const name = prompt("Supplier or trader name");
  if (!name || !name.trim()) return;
  const types = Object.entries(SUPPLIER_TYPES);
  const pick = prompt("What do they provide?\n" + types.map(([, l], n) => n + 1 + ". " + l).join("\n"), "1");
  const type = types[Number(pick) - 1]?.[0] || "other";
  const p = currentPlan();
  p.suppliers ||= [];
  const id = uid();
  supplierOpen.add(id);
  p.suppliers.push({ id, name: name.trim(), type, contact: "", kw: "", phase: "1", files: [] });
  save();
  planRefresh();
}
function setSupplier(id, field, value) {
  const s = supplierById(currentPlan(), id);
  if (!s) return;
  if (field === "name" && !String(value).trim()) return planRefresh();
  s[field] = value;
  save();
  planRefresh();
}
function deleteSupplier(id) {
  const p = currentPlan(),
    s = supplierById(p, id);
  if (!s || !confirm("Remove " + s.name + " from this event?")) return;
  p.suppliers = p.suppliers.filter((x) => x.id !== id);
  save();
  planRefresh();
}
async function attachToSupplier(id) {
  const f = await pickFile(".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,image/*", "plan");
  if (!f) return;
  const s = supplierById(currentPlan(), id);
  s.files = [...(s.files || []), f];
  save();
  planRefresh();
}
function removeSupplierFile(id, n) {
  const s = supplierById(currentPlan(), id);
  if (!confirm("Remove " + s.files[n].name + "?")) return;
  s.files.splice(n, 1);
  save();
  planRefresh();
}

// ---------- Compliance pack ----------
function complianceStatus(p) {
  const items = p.stages.flatMap((s) => s.items.map((i) => ({ stage: s, item: i }))).filter(({ item }) => item.status !== "na");
  const docs = items.filter(({ item }) => item.doc);
  const certs = items.filter(({ item }) => item.cert);
  const docsOk = docs.filter(({ item }) => item.doc.status === "approved");
  const certsOk = certs.filter(({ item }) => item.status === "done" && item.files?.length);
  const due = p.eventDate || todayKey();
  const sup = (p.suppliers || []).map((s) => ({ s, gaps: supplierGaps(s, due) }));
  const supOk = sup.filter((x) => !x.gaps.length);
  const total = docs.length + certs.length + sup.length;
  const ok = docsOk.length + certsOk.length + supOk.length;
  return { docs, certs, docsOk, certsOk, sup, supOk, pct: total ? Math.round((ok / total) * 100) : 0 };
}
function planCompliance(p) {
  const c = complianceStatus(p);
  const row = (ok, title, detail, action) => `<div class="comp-row ${ok ? "ok" : ""}"><span class="comp-mark" aria-hidden="true">${ok ? "✓" : "!"}</span><div class="grow"><b>${esc(title)}</b><span class="muted">${detail}</span></div>${action || ""}</div>`;
  const docs = c.docs.map(({ item: i }) => row(i.doc.status === "approved", i.title, i.doc.status === "approved" ? "Approved by " + esc(i.doc.approval.by) + " · " + hqWhen(i.doc.approval.at) : "Draft: needs review", `<button class="btn small secondary" onclick="plannerTab='docs';render()">Open</button>`)).join("");
  const certs = c.certs
    .map(({ item: i }) => {
      const ok = i.status === "done" && i.files?.length;
      return row(ok, i.title, ok ? i.files.length + " file" + (i.files.length > 1 ? "s" : "") + " filed" : i.files?.length ? "Filed, but item not marked done" : "Nothing filed yet" + (i.due ? " · due " + fmtDay(i.due) : ""), `<button class="btn small secondary" onclick="plannerTab='checklist';plannerOpen.add(${i.id});render()">Open</button>`);
    })
    .join("");
  const sups = c.sup.map(({ s, gaps }) => row(!gaps.length, s.name, gaps.length ? "Missing: " + gaps.map(esc).join(", ") : "All evidence received", `<button class="btn small secondary" onclick="plannerTab='suppliers';render()">Open</button>`)).join("");
  return `<div class="panel comp-head">${ring(c.pct, 72)}<div><h2 style="margin:0">Compliance pack</h2><p class="muted" style="margin:4px 0 0">${c.docsOk.length}/${c.docs.length} documents approved · ${c.certsOk.length}/${c.certs.length} certificates filed · ${c.supOk.length}/${c.sup.length} suppliers compliant</p></div>
    <button class="btn" onclick="printCompliance()">🖨️ Print pack</button></div>
    <p class="hint">This is everything a venue, council or Safety Advisory Group will usually ask for. It is a planning aid built on UK health and safety law and official guidance: a competent person should review your documents, and check the current Purple Guide and your local authority's requirements for this event.</p>
    <h3>Safety documents</h3>${docs || '<p class="empty">No documents on this plan.</p>'}
    <h3>Licences, certificates & evidence</h3>${certs || '<p class="empty">No certificates on this plan.</p>'}
    <h3>Suppliers</h3>${sups || '<p class="empty">No suppliers added yet.</p>'}`;
}
function printCompliance() {
  const p = currentPlan(),
    c = complianceStatus(p),
    pw = powerEstimate(p.suppliers || []);
  const w = window.open("", "_blank");
  if (!w) return alert("Allow pop-ups to print the pack.");
  const tr = (ok, a, b) => `<tr><td class="${ok ? "ok" : "no"}">${ok ? "✓" : "✗"}</td><td>${esc(a)}</td><td>${b}</td></tr>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Compliance pack · ${esc(p.title)}</title><style>body{font:13px/1.5 Arial,sans-serif;color:#111;max-width:820px;margin:30px auto;padding:0 20px}h1{font-size:22px;margin:0}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #999}table{width:100%;border-collapse:collapse}td{padding:5px 6px;border-bottom:1px solid #ddd;vertical-align:top}td:first-child{width:24px;font-weight:bold}.ok{color:#067647}.no{color:#b42318}.note{font-size:11px;color:#555;margin-top:24px}@media print{button{display:none}}</style></head><body>
    <button onclick="print()">Print / Save as PDF</button>
    <h1>${esc(p.title)}: compliance pack</h1><p>${esc(db.company?.name || "HD Events")} · ${p.eventDate ? esc(fmtDay(p.eventDate, { day: "numeric", month: "long", year: "numeric" })) : ""}${p.venue ? " · " + esc(p.venue) : ""}${p.capacity ? " · capacity " + p.capacity.toLocaleString("en-GB") : ""}<br>Printed ${esc(hqWhen(new Date().toISOString()))} · ${c.pct}% complete</p>
    <h2>Safety documents</h2><table>${c.docs.map(({ item: i }) => tr(i.doc.status === "approved", i.title, i.doc.status === "approved" ? "Approved by " + esc(i.doc.approval.by) + ", " + esc(hqWhen(i.doc.approval.at)) + " (ref " + esc(i.doc.approval.hash) + ")" : "DRAFT: needs review")).join("")}</table>
    <h2>Licences, certificates & evidence</h2><table>${c.certs.map(({ item: i }) => tr(i.status === "done" && i.files?.length, i.title, (i.files || []).map((f) => esc(f.name)).join(", ") || "Not filed")).join("")}</table>
    <h2>Suppliers</h2><table>${c.sup.map(({ s, gaps }) => tr(!gaps.length, s.name + " (" + (SUPPLIER_TYPES[s.type] || "Other") + ")", (Number(s.kw) > 0 ? s.kw + " kW · " : "") + (gaps.length ? "Missing: " + gaps.map(esc).join(", ") : "All evidence received"))).join("")}</table>
    <h2>Power estimate</h2><p>${pw.kw ? `Connected load ${pw.kw} kW · estimated demand ${pw.kva} kVA · suggested generator ${pw.size ? pw.size + " kVA" : "specialist (over 1000 kVA)"}` : "No power figures entered."}</p>
    <p class="note">Planning aid only. Safety documents must be reviewed by a competent person. Temporary electrical systems must be designed, installed and certified by a competent electrician to BS 7909. Check the current Purple Guide (Events Industry Forum), HSE guidance and local authority requirements.</p></body></html>`);
  w.document.close();
}
