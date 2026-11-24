function equipmentImage(i) {
  let photo = String(i.photo || "").trim();
  return /^https:\/\//i.test(photo) || /^\/files\/equipment\//.test(photo)
    ? `<img src="${esc(photo)}" alt="${esc(i.name)}" loading="lazy" onerror="this.replaceWith(document.createTextNode('No photo'))">`
    : '<span class="no-photo">No photo</span>';
}
const kg = (n) => (Number(n) || 0).toLocaleString("en-GB", { maximumFractionDigits: 1 }) + " kg";
const hasNum = (v) => v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v));
// "12 kg" or "~12 kg" for an estimate, or "—" when unknown.
const weightText = (i) => (hasNum(i.weightKg) ? (i.weightEst ? "~" : "") + kg(i.weightKg) : "—");
const valueText = (i) => (!me.money ? "—" : hasNum(i.value) ? (i.valueEst ? "~" : "") + money(i.value) : "—");
function equipmentCard(i, add) {
  return `<div class="equipment-card"><div class="equipment-photo">${equipmentImage(i)}</div><div class="equipment-body"><span class="tag cat-tag">${esc(i.category || "Uncategorised")}</span><strong>${esc(i.name)}</strong><div class="muted">${Number(i.qty) || 0} owned · ${weightText(i)} each${me.money ? " · hire " + money(i.price) : ""}</div>${i.accessories?.length ? `<div class="acc-note">Accessories: ${i.accessories.map((a) => `${a.qty} × ${esc(a.item)}`).join(", ")}</div>` : ""}${add ? `<button class="btn secondary" type="button" onclick="addKitById(${i.id})">+ Add to job</button>` : `<button class="btn secondary" type="button" onclick="editItem(${i.id})">Edit</button> <button class="btn secondary" onclick="pickEquipmentPhoto(${i.id})">Upload picture</button>`}</div></div>`;
}
// Search by name and filter by category tag.
function inventoryMatches() {
  const q = inventoryQuery.toLowerCase();
  return db.inventory.filter((i) => (!q || i.name.toLowerCase().includes(q) || (i.notes || "").toLowerCase().includes(q)) && (!inventoryCat || (i.category || "") === inventoryCat));
}
const inventoryCats = () => [...new Set([...cats, ...db.inventory.map((i) => i.category).filter(Boolean)])];
function inventory() {
  const t = inventoryTotals(db.inventory);
  const summary = `<div class="power-grid inv-totals">
    <div><span class="muted">Equipment lines</span><b>${t.lines}</b><span class="muted">${t.units} units in total</span></div>
    ${me.money ? `<div><span class="muted">Total kit value</span><b>${money(t.value)}</b><span class="muted">${t.missingValue ? t.missingValue + " without a value" : "All items valued"}${t.estValue ? " · " + t.estValue + " estimated" : ""}</span></div>` : ""}
    <div><span class="muted">Total weight</span><b>${kg(t.weight)}</b><span class="muted">${t.missingWeight ? t.missingWeight + " without a weight" : "All items weighed"}${t.estWeight ? " · " + t.estWeight + " estimated" : ""}</span></div></div>
    <p class="hint">~ means an estimate (for example a second-hand value or a custom flight case weight). Weights are per unit as it travels, in its case if it has its own.</p>`;
  const counts = {};
  db.inventory.forEach((i) => (counts[i.category || ""] = (counts[i.category || ""] || 0) + 1));
  const content = `${summary}<div class="toolbar"><button class="btn" onclick="editItem(null)">+ Add equipment</button><button class="btn secondary" onclick="openInventoryImport()">Import list</button><button class="btn secondary" onclick="printInventory()">Print</button><button class="btn secondary" onclick="exportInventory()">Export spreadsheet</button></div>
    <div class="inventory-tools"><input class="field" placeholder="Search kit by name or notes…" value="${esc(inventoryQuery)}" oninput="inventoryQuery=this.value;updateInventoryResults()"><select class="field inv-cat" aria-label="Filter by category" onchange="inventoryCat=this.value;updateInventoryResults()"><option value="">All categories (${db.inventory.length})</option>${inventoryCats().map((c) => `<option value="${esc(c)}" ${c === inventoryCat ? "selected" : ""}>${esc(c)} (${counts[c] || 0})</option>`).join("")}</select><div class="view-switch"><button class="btn secondary ${inventoryView === "grid" ? "active" : ""}" onclick="inventoryView='grid';render()">Grid</button><button class="btn secondary ${inventoryView === "list" ? "active" : ""}" onclick="inventoryView='list';render()">List</button></div></div><div id="inventoryResults">${inventoryResults(inventoryMatches())}</div>`;
  return panel("Kit / Inventory", content) + vehiclesPanel();
}
function inventoryResults(matches) {
  if (!matches.length) return `<p class="empty">${db.inventory.length ? "No equipment matches this search or category." : "No equipment yet. Press + Add equipment, or Import list."}</p>`;
  return inventoryView === "grid"
    ? `<div class="equipment-grid">${matches.map((i) => equipmentCard(i, false)).join("")}</div>`
    : `<div class="tablewrap"><table><thead><tr><th>Equipment</th><th>Category</th><th>Owned</th><th>Out of service</th><th>To hire</th><th>Weight each</th>${me.money ? "<th>Value each</th><th>Total value</th><th>Hire price</th>" : ""}<th></th></tr></thead><tbody>${matches
        .map(
          (i) =>
            `<tr><td>${esc(i.name)}${i.accessories?.length ? `<div class="acc-note">Accessories: ${i.accessories.map((a) => `${a.qty} × ${esc(a.item)}`).join(", ")}</div>` : ""}</td><td>${esc(i.category || "")}</td><td>${i.qty}</td><td>${i.service}</td><td>${availableToHire(i)}${setAside(db, i.name) ? ` <span class="muted">(${setAside(db, i.name)} kept in packages)</span>` : ""}</td><td>${weightText(i)}</td>${me.money ? `<td>${valueText(i)}</td><td>${hasNum(i.value) ? money(i.value * i.qty) : "—"}</td><td>${money(i.price)}</td>` : ""}<td><button class="btn small secondary" onclick="editItem(${i.id})">Edit</button></td></tr>`,
        )
        .join("")}</tbody></table></div>`;
}
// ---------- Accessories (other stock items that usually go out with this one) ----------
let accDraft = [];
const availableToHire = (i) => Math.max(0, (Number(i.qty) || 0) - (Number(i.service) || 0) - setAside(db, i.name));
function accBox(id) {
  const self = db.inventory.find((x) => x.id === id);
  const options = db.inventory.filter((x) => x.id !== id && !accDraft.some((a) => a.item === x.name)).sort((a, b) => a.name.localeCompare(b.name));
  return `${accDraft
    .map((a, n) => `<div class="acc-row"><span>${esc(a.item)}</span><input class="field" type="number" min="1" max="100" value="${a.qty}" aria-label="How many ${esc(a.item)} per ${esc(self?.name || "item")}" onchange="setAccQty(${n},this.value,${id})"><button type="button" class="kit-x" onclick="removeAcc(${n},${id})" aria-label="Remove ${esc(a.item)}">×</button></div>`)
    .join("") || '<p class="hint" style="margin:6px 0">None yet. Add things like its power cable or flight case. When you add this item to a job, its accessories are added as their own priced lines, and you can remove any you don\'t need.</p>'}
    ${options.length ? `<div class="acc-add"><select class="field" id="accPick"><option value="">Choose an item from stock…</option>${options.map((x) => `<option>${esc(x.name)}</option>`).join("")}</select><button type="button" class="btn small secondary" onclick="addAcc(${id})">Add accessory</button></div>` : '<p class="hint">Add the accessory to the inventory first (e.g. "IEC power cable"), then choose it here.</p>'}`;
}
function addAcc(id) {
  const name = $("accPick").value;
  if (!name) return;
  accDraft.push({ item: name, qty: 1 });
  $("accBox").innerHTML = accBox(id);
}
function removeAcc(n, id) {
  accDraft.splice(n, 1);
  $("accBox").innerHTML = accBox(id);
}
function setAccQty(n, v, id) {
  accDraft[n].qty = Math.min(100, Math.max(1, Math.round(Number(v)) || 1));
  $("accBox").innerHTML = accBox(id);
}
// One window for adding (id = null) or editing an item, with every detail filled in.
function editItem(id) {
  const isNew = id === null;
  const i = isNew ? { name: "", qty: 1, service: 0, category: inventoryCat || "Audio" } : db.inventory.find((x) => x.id === id);
  if (!i) return;
  $("itemDialog")?.remove();
  accDraft = (i.accessories || []).map((a) => ({ ...a }));
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "itemDialog";
  const numField = (name, label, value, step = "0.1") => `<label><span class="muted">${label}</span><input class="field" type="number" min="0" step="${step}" name="${name}" value="${hasNum(value) ? esc(value) : ""}"></label>`;
  const withEst = (field, name, on) => field.replace("</label>", `<span class="est-line"><input type="checkbox" name="${name}" ${on ? "checked" : ""}> This is an estimate</span></label>`);
  root.innerHTML = `<form class="panel" onsubmit="saveItem(event,${isNew ? "null" : id})"><div class="line"><h2 style="margin:0">${isNew ? "Add equipment" : "Edit " + esc(i.name)}</h2><button type="button" class="btn small ghost" onclick="$('itemDialog').remove()">Close</button></div>
    <div class="form" style="margin-top:14px">
      <label class="wide"><span class="muted">Equipment name</span><input class="field" name="name" required value="${esc(i.name)}" placeholder="e.g. Allen & Heath SQ5"></label>
      <label><span class="muted">Category</span><select class="field" name="category">${inventoryCats().map((c) => `<option ${c === i.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      ${numField("qty", "Quantity owned", i.qty, "1")}${numField("service", "Out for service", i.service, "1")}
      ${withEst(numField("weightKg", "Weight each (kg), as it travels", i.weightKg), "weightEst", i.weightEst)}
      ${me.money ? `${withEst(numField("value", "Value each (£): what it's worth or cost", i.value, "1"), "valueEst", i.valueEst)}${numField("price", "Default hire price per day (£)", i.price, "0.01")}` : ""}
      <div class="wide dims"><span class="muted">Size as it travels, in its case (cm): length × width × height</span><div class="dims-row">${["lengthCm", "widthCm", "heightCm"].map((f, n) => `<input class="field" type="number" min="0" step="0.5" name="${f}" placeholder="${["Length", "Width", "Height"][n]}" aria-label="${["Length", "Width", "Height"][n]} in cm" value="${hasNum(i[f]) ? esc(i[f]) : ""}">`).join("<span>×</span>")}</div>
        <div class="dims-row"><label class="est-line"><input type="checkbox" name="stackable" ${i.stackable === false ? "" : "checked"}> Other things can be stacked on it</label><label class="est-line"><input type="checkbox" name="inCase" ${i.inCase ? "checked" : ""}> Travels inside another case (takes no extra space)</label></div></div>
      <div class="wide acc-box"><span class="muted">Accessories (optional extras that usually go out with it, each with its own price)</span><div id="accBox">${accBox(id)}</div></div>
      <label class="wide"><span class="muted">Notes (model, serial, where the figures came from)</span><textarea class="field" name="notes" rows="2">${esc(i.notes || "")}</textarea></label>
    </div><div class="toolbar"><button class="btn big" type="submit">${isNew ? "Add equipment" : "Save"}</button>${isNew ? "" : `<button type="button" class="btn secondary" onclick="editEquipmentPhoto(${id})">Picture web address</button><button type="button" class="btn danger" onclick="deleteEquipment(${id})">Delete item</button>`}</div></form>`;
  document.body.appendChild(root);
  root.querySelector("input[name=name]").focus();
}
function saveItem(e, id) {
  e.preventDefault();
  const d = data(e),
    isNew = id === null,
    i = isNew ? { id: uid(), photo: "", price: 0 } : db.inventory.find((x) => x.id === id);
  const name = d.name.trim();
  if (db.inventory.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return alert("Another item already has that name.");
  const n = (v) => (v === "" || v === undefined ? undefined : Number(v));
  const next = { ...i, name, category: d.category, qty: Number(d.qty) || 0, service: Number(d.service) || 0, weightKg: n(d.weightKg), weightEst: d.weightEst === "on", lengthCm: n(d.lengthCm), widthCm: n(d.widthCm), heightCm: n(d.heightCm), stackable: d.stackable === "on", inCase: d.inCase === "on", notes: d.notes.trim() };
  if (next.stackable) delete next.stackable; // stackable is the default
  if (accDraft.length) next.accessories = accDraft.map((a) => ({ item: a.item, qty: a.qty }));
  else delete next.accessories;
  if (!next.inCase) delete next.inCase;
  if (me.money) Object.assign(next, { value: n(d.value), valueEst: d.valueEst === "on", price: Number(d.price) || 0 });
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  try {
    validate({ ...db, inventory: isNew ? [...db.inventory, next] : db.inventory.map((x) => (x.id === id ? next : x)) });
  } catch (err) {
    return alert(err.message);
  }
  if (!isNew && name !== i.name) {
    // Keep job kit lists and other items' accessories linked to the new name.
    db.jobs.forEach((j) => (j.kit || []).forEach((k) => k.item === i.name && (k.item = name)));
    db.inventory.forEach((x) => (x.accessories || []).forEach((a) => a.item === i.name && (a.item = name)));
    db.crossHires.forEach((h) => h.item === i.name && (h.item = name));
    db.jobs.forEach((j) => (j.kit || []).forEach((k) => k.accessoryOf === i.name && (k.accessoryOf = name)));
  }
  // A new hire price can update jobs that haven't been quoted yet (sent quotes and bookings keep their price).
  if (!isNew && me.money && next.price !== undefined && Number(next.price) !== Number(i.price)) {
    const same = (k) => (k.item === name || k.item === i.name) && Number(k.price) === Number(i.price);
    const open = db.jobs.filter((j) => stageOf(j) === "enquiry" && (j.kit || []).some(same));
    if (open.length && confirm(`Update the price of ${name} to ${money(next.price)} on ${open.length} enquir${open.length > 1 ? "ies" : "y"} not quoted yet (${open.map((j) => j.title).join(", ")})?`))
      open.forEach((j) => j.kit.forEach((k) => same(k) && (k.price = Number(next.price))));
  }
  if (isNew) db.inventory.push(next);
  else {
    Object.assign(i, next);
    for (const k of Object.keys(i)) if (!(k in next)) delete i[k];
  }
  $("itemDialog")?.remove();
  save();
  render();
}
function deleteEquipment(id) {
  const i = db.inventory.find((x) => x.id === id);
  if (db.jobs.some((j) => (j.kit || []).some((k) => k.item === i.name))) return alert(i.name + " is on a job's kit list. Remove it from those jobs first.");
  const usedBy = allocatedTo(db.inventory, i.name);
  if (usedBy.length) return alert(i.name + " is an accessory of " + usedBy.map((u) => u.main).join(", ") + ". Remove it from there first.");
  const inPackages = db.packages.filter((p) => p.items.some((k) => String(k.id) === String(id)));
  if (!confirm("Delete " + i.name + " from the inventory?" + (inPackages.length ? `\n\nIt will also be taken out of ${inPackages.length} package${inPackages.length > 1 ? "s" : ""}: ${inPackages.map((p) => p.name).join(", ")}.` : ""))) return;
  inPackages.forEach((p) => (p.items = p.items.filter((k) => String(k.id) !== String(id))));
  db.inventory = db.inventory.filter((x) => x.id !== id);
  $("itemDialog")?.remove();
  save();
  render();
}
// Spreadsheet of the whole inventory (opens in Excel or Google Sheets).
function exportInventory() {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""') + '"' : s;
  };
  const head = ["Equipment", "Category", "Owned", "Out of service", "Length (cm)", "Width (cm)", "Height (cm)", "Weight each (kg)", "Weight estimated", "Total weight (kg)", ...(me.money ? ["Value each (£)", "Value estimated", "Total value (£)", "Hire price per day (£)"] : []), "Accessories", "Notes"];
  const rows = [...db.inventory]
    .sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name))
    .map((i) => [
      i.name, i.category || "", i.qty, i.service, i.lengthCm ?? "", i.widthCm ?? "", i.heightCm ?? "",
      hasNum(i.weightKg) ? i.weightKg : "", i.weightEst ? "Yes" : "", hasNum(i.weightKg) ? Math.round(i.weightKg * i.qty * 10) / 10 : "",
      ...(me.money ? [hasNum(i.value) ? i.value : "", i.valueEst ? "Yes" : "", hasNum(i.value) ? Math.round(i.value * i.qty * 100) / 100 : "", Number(i.price) || 0] : []),
      (i.accessories || []).map((a) => a.qty + " x " + a.item).join("; "),
      i.notes || "",
    ]);
  const t = inventoryTotals(db.inventory);
  rows.push([], ["TOTAL", "", t.units, "", "", "", "", "", "", t.weight, ...(me.money ? ["", "", t.value, ""] : []), "", ""]);
  const csv = "\ufeff" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "HD Events inventory " + todayKey() + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
// ---------- Import a list (pasted from a spreadsheet, CSV or ChatGPT) ----------
const IMPORT_HEADINGS = "Equipment,Category,Owned,Out of service,Length (cm),Width (cm),Height (cm),Weight each (kg),Weight estimated,Value each (£),Value estimated,Hire price per day (£),Stackable,Inside another case,Notes";
function openInventoryImport() {
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "importDialog";
  root.innerHTML = `<div class="panel"><div class="line"><h2 style="margin:0">Import equipment list</h2><button type="button" class="btn small ghost" onclick="$('importDialog').remove()">Close</button></div>
    <p>Paste a table copied from Excel or Google Sheets, or CSV text (for example from ChatGPT). The first row must be headings. Items whose name matches one already in your inventory are updated; the rest are added.</p>
    <p class="hint">Headings the app understands (any order, any you don't have can be left out):</p><pre class="import-head">${esc(IMPORT_HEADINGS)}</pre>
    <div class="toolbar"><button type="button" class="btn small secondary" onclick="copyImportHeadings()">Copy these headings</button></div>
    <textarea class="field" id="importText" rows="10" placeholder="Paste here…" oninput="previewImport()"></textarea>
    <div id="importPreview" class="hint"></div>
    <div class="toolbar"><button class="btn big" id="importGo" disabled onclick="runImport()">Import</button></div></div>`;
  document.body.appendChild(root);
  $("importText").focus();
}
async function copyImportHeadings() {
  try {
    await navigator.clipboard.writeText(IMPORT_HEADINGS);
    toast("Headings copied");
  } catch {
    alert(IMPORT_HEADINGS);
  }
}
function importPlan() {
  const { items, skipped } = importRows($("importText").value);
  const byName = new Map(db.inventory.map((i) => [i.name.toLowerCase(), i]));
  return { items, skipped, added: items.filter((i) => !byName.has(i.name.toLowerCase())).length, updated: items.filter((i) => byName.has(i.name.toLowerCase())).length };
}
function previewImport() {
  const el = $("importPreview"),
    go = $("importGo");
  try {
    const p = importPlan();
    go.disabled = !p.items.length;
    el.innerHTML = p.items.length ? `Ready: <b>${p.added}</b> new item${p.added === 1 ? "" : "s"}, <b>${p.updated}</b> to update.${p.skipped.length ? " Skipped: " + p.skipped.map(esc).join("; ") : ""}` : "Paste a table with a heading row to see what will be imported.";
  } catch (e) {
    go.disabled = true;
    el.innerHTML = `<span class="warn">${esc(e.message)}</span>`;
  }
}
function runImport() {
  const p = importPlan();
  const byName = new Map(db.inventory.map((i) => [i.name.toLowerCase(), i]));
  const next = db.inventory.map((i) => ({ ...i }));
  const index = new Map(next.map((i, n) => [i.name.toLowerCase(), n]));
  for (const it of p.items) {
    const clean = { ...it };
    if (!me.money) for (const f of ["value", "valueEst", "price"]) delete clean[f];
    const key = it.name.toLowerCase();
    if (index.has(key)) Object.assign(next[index.get(key)], clean);
    else {
      next.push({ id: uid() + next.length, qty: 1, service: 0, price: 0, photo: "", category: guessCategory(it.name), ...clean });
      index.set(key, next.length - 1);
    }
  }
  try {
    validate({ ...db, inventory: next });
  } catch (e) {
    return alert("Nothing imported. " + e.message);
  }
  db.inventory = next;
  $("importDialog").remove();
  save();
  render();
  toast(`Imported: ${p.added} added, ${p.updated} updated`);
}
// ---------- Vans and trailers ----------
function vehicleList() {
  return Array.isArray(db.vehicles) ? db.vehicles : [];
}
function vehiclesPanel() {
  const list = vehicleList();
  return panel(
    "Vans & trailers",
    `<p class="hint">Payload is the most it can carry: gross weight minus kerb weight, from the plate inside the door or the V5C. Load space is measured inside, floor to roof, bulkhead to rear doors.</p>
    ${list.map((v) => row(`<b>${esc(v.name)}</b><div class="muted">${v.lengthCm ? `Load space ${v.lengthCm} × ${v.widthCm} × ${v.heightCm} cm` : "Load space size not set"}</div>`, `${kg(v.payloadKg)} payload ${me.owner ? `<button class="btn small secondary" onclick="editVehicle(${v.id})">Edit</button> <button class="btn small ghost" onclick="removeVehicle(${v.id})">Remove</button>` : ""}`)).join("") || '<p class="empty">No vehicles yet.</p>'}
    ${me.owner ? `<form class="vehicle-form" onsubmit="addVehicle(event)"><input class="field" name="name" required placeholder="e.g. Transit LWB or 2.7t box trailer"><input class="field" name="payloadKg" type="number" min="1" required placeholder="Payload kg"><input class="field" name="lengthCm" type="number" min="1" placeholder="Load length cm"><input class="field" name="widthCm" type="number" min="1" placeholder="Width cm"><input class="field" name="heightCm" type="number" min="1" placeholder="Height cm"><button class="btn">Add vehicle</button></form>` : ""}`,
  );
}
function addVehicle(e) {
  e.preventDefault();
  const d = data(e);
  db.vehicles = [...vehicleList(), { id: uid(), name: d.name.trim(), payloadKg: Number(d.payloadKg), ...(d.lengthCm && d.widthCm && d.heightCm ? { lengthCm: Number(d.lengthCm), widthCm: Number(d.widthCm), heightCm: Number(d.heightCm) } : {}) }];
  save();
  render();
}
function editVehicle(id) {
  const v = vehicleList().find((x) => x.id === id);
  const payload = prompt("Payload for " + v.name + " (kg)", v.payloadKg ?? "");
  if (payload === null) return;
  const size = prompt("Load space inside, in cm: length x width x height (e.g. 335 x 175 x 175)", v.lengthCm ? `${v.lengthCm} x ${v.widthCm} x ${v.heightCm}` : "");
  if (size === null) return;
  const dims = size.split(/[x×*, ]+/i).map(Number).filter((n) => n > 0);
  if (size.trim() && dims.length !== 3) return alert("Enter three numbers, e.g. 335 x 175 x 175");
  db.vehicles = vehicleList().map((x) => (x.id === id ? { ...x, payloadKg: Number(payload) || x.payloadKg, ...(dims.length === 3 ? { lengthCm: dims[0], widthCm: dims[1], heightCm: dims[2] } : {}) } : x));
  save();
  render();
}
function removeVehicle(id) {
  if (!confirm("Remove this vehicle?")) return;
  db.vehicles = vehicleList().filter((v) => v.id !== id);
  save();
  render();
}
function updateInventoryResults() {
  const el = $("inventoryResults");
  if (el) el.innerHTML = inventoryResults(inventoryMatches());
}
function editEquipmentPhoto(id) {
  let item = db.inventory.find((i) => i.id === id);
  if (!item) return;
  let photo = prompt(
    "Paste a direct HTTPS image URL for " + item.name + " (leave empty to remove)",
    item.photo || "",
  );
  if (photo === null) return;
  if (photo.trim() && !/^https:\/\//i.test(photo.trim())) {
    alert("Please use a direct HTTPS image URL.");
    return;
  }
  item.photo = photo.trim();
  save();
  render();
}
function addEquipment(e) {
  e.preventDefault();
  let d = data(e);
  if (db.inventory.some((i) => i.name.toLowerCase() === d.name.toLowerCase())) {
    alert("That item already exists");
    return;
  }
  if (+d.service > +d.qty) {
    alert("Out-of-service quantity cannot exceed stock");
    return;
  }
  db.inventory.push({
    id: uid(),
    name: d.name,
    qty: +d.qty,
    service: +d.service,
    price: +d.price || 0,
    ...(d.weightKg ? { weightKg: Number(d.weightKg) } : {}),
    ...(d.value ? { value: Number(d.value) } : {}),
    photo: "",
  });
  save();
  render();
}
function adjustStock(id) {
  const item = db.inventory.find((i) => i.id === id);
  const count = prompt("Quantity owned", item.qty);
  if (count === null) return;
  const service = prompt("Units out for service", item.service);
  if (service === null) return;
  const next = { ...item, qty: Number(count), service: Number(service) };
  try {
    validate({ ...db, inventory: db.inventory.map((i) => (i.id === id ? next : i)) });
  } catch (e) {
    alert(e.message);
    return;
  }
  Object.assign(item, next);
  save();
  render();
}

// Upload a picture for an equipment item to file storage (instead of pasting a web address).
function pickEquipmentPhoto(id) {
  const item = db.inventory.find((i) => i.id === id);
  if (!item) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/gif";
  input.hidden = true;
  document.body.appendChild(input); // some browsers only open the picker for inputs on the page
  input.onchange = async () => {
    input.remove();
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert("Please use a picture smaller than 5 MB.");
    try {
      item.photo = await uploadImage(file, "equipment");
      save();
      render();
    } catch (e) {
      alert("Picture not uploaded. " + e.message);
    }
  };
  input.click();
}
