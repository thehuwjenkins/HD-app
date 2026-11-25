// Packages: a named set of inventory items added to a job as one entry, e.g. "2 × PS10 in flight case".
// Its price is either its own package price or the sum of its items' hire prices; items marked
// "included free" (the flight case) cost nothing. Weight comes from each item × the quantity.
let packageDraft = {},
  packageFree = new Set(),
  packageEditing = null;

function packageLines(p) {
  return p.items
    .map((k) => ({ qty: Number(k.qty) || 0, item: db.inventory.find((i) => String(i.id) === String(k.id)) }))
    .filter((x) => x.item && x.qty > 0);
}
function packageTotals(p) {
  const pr = packagePricing(p, db.inventory);
  const lines = pr.lines;
  return {
    lines,
    price: pr.price,
    itemsPrice: pr.itemsPrice,
    fixed: pr.fixed,
    value: pr.value,
    weight: Math.round(lines.reduce((s, x) => s + x.qty * (Number(x.item.weightKg) || 0), 0) * 10) / 10,
    noWeight: lines.filter((x) => !hasNum(x.item.weightKg)).length,
    units: lines.reduce((s, x) => s + x.qty, 0),
  };
}
function packageCard(p) {
  const t = packageTotals(p);
  const missing = p.items.length - t.lines.length;
  return `<div class="jobcard package-card"><div class="head"><div><b>${esc(p.name)}</b>${p.keepTogether ? ' <span class="tag cert">Kept together</span>' : ""}<div class="muted">${t.units} item${t.units === 1 ? "" : "s"}${p.keepTogether ? " · set aside from hire stock" : ""}</div></div>
    <div class="pkg-totals">${me.money ? `<span><span class="muted">${t.fixed ? "Package price" : "Hire price"}</span><b>${money(t.price)}</b>${t.fixed && t.itemsPrice !== t.price ? `<span class="muted">items ${money(t.itemsPrice)}</span>` : ""}</span><span><span class="muted">Kit value</span><b>${money(t.value)}</b></span>` : ""}<span><span class="muted">Weight</span><b>${kg(t.weight)}</b></span></div></div>
    <details><summary>What's in it</summary><table class="pkg-table"><thead><tr><th>Qty</th><th>Item</th>${me.money ? '<th class="num">Value each</th><th class="num">Charged</th>' : ""}<th class="num">Weight</th></tr></thead><tbody>${t.lines
      .map((x) => `<tr><td>${x.qty}</td><td>${esc(x.item.name)}${x.free ? ' <span class="tag">Included free</span>' : ""}</td>${me.money ? `<td class="num">${hasNum(x.item.value) ? money(x.item.value) : "—"}</td><td class="num">${x.free ? "Free" : money(x.qty * x.unit)}</td>` : ""}<td class="num">${hasNum(x.item.weightKg) ? kg(x.qty * x.item.weightKg) : "—"}</td></tr>`)
      .join("")}</tbody></table>${t.noWeight ? `<p class="hint">${t.noWeight} item${t.noWeight > 1 ? "s have" : " has"} no weight yet, so the weight is low.</p>` : ""}${missing ? `<p class="hint">${missing} item${missing > 1 ? "s are" : " is"} no longer in the inventory.</p>` : ""}</details>
    ${canWrite("packages") ? `<div class="toolbar" style="margin:10px 0 0"><button class="btn small secondary" onclick="editPackage(${p.id})">Edit</button><button class="btn small danger" onclick="removePackage(${p.id})">Remove package</button></div>` : ""}</div>`;
}
function packages() {
  const editing = db.packages.find((p) => p.id === packageEditing);
  return (
    panel(
      editing ? "Edit package" : "Build a package",
      `<p class="hint">A package goes on a job as <b>one entry with one price</b>, e.g. "2 × PS10 in flight case". Tick <b>Free</b> next to anything included at no charge (like the flight case). Leave the package price blank to charge the items' own hire prices. Every item keeps its own value, and stock is still counted per item.</p>
      <form class="form" onsubmit="savePackage(event)"><label><div class="muted">Package name</div><input class="field" name="name" placeholder="e.g. Small PA — PS10" required value="${esc(editing?.name || "")}"></label><label><div class="muted">Search equipment</div><input class="field" id="packageSearch" placeholder="Search kit" oninput="filterPackageItems(this.value)"></label>
      ${me.money ? `<label><div class="muted">Package hire price (optional)</div><input class="field" name="price" type="number" min="0" step="0.01" placeholder="Blank = items' prices added up" value="${esc(editing && hasNum(editing.price) ? editing.price : "")}" oninput="packagePriceDraft=this.value;$('packagePreview').innerHTML=packagePreview()"></label>` : ""}
      <label class="wide check-card"><input type="checkbox" name="keepTogether" ${editing?.keepTogether ? "checked" : ""}> Keep this kit together (always set aside from hire stock, e.g. a built PA rack whose cables never leave it)</label><div class="wide" id="packageItems">${packageItemChoices("")}</div><div class="wide" id="packagePreview">${packagePreview()}</div>
      <div class="wide toolbar"><button class="btn" type="submit">${editing ? "Save changes" : "Save package"}</button>${editing ? `<button class="btn ghost" type="button" onclick="cancelPackageEdit()">Cancel</button>` : ""}</div></form>`,
    ) + panel("Packages", db.packages.map(packageCard).join("") || '<p class="empty">No packages yet.</p>')
  );
}
function packageItemChoices(q) {
  return (
    db.inventory
      .filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
      .map(
        (i) =>
          `<label class="package-choice"><span>${esc(i.name)} <span class="muted">${me.money ? money(i.price) + " · " : ""}${weightText(i)}</span></span><span class="pkg-choice-ctl"><label class="pkg-free" title="Included at no charge"><input type="checkbox" ${packageFree.has(String(i.id)) ? "checked" : ""} data-item-id="${i.id}" onchange="this.checked?packageFree.add(this.dataset.itemId):packageFree.delete(this.dataset.itemId);$('packagePreview').innerHTML=packagePreview()"> Free</label><input class="field" type="number" min="0" max="999" value="${packageDraft[i.id] || 0}" data-item-id="${i.id}" aria-label="Quantity of ${esc(i.name)}" oninput="packageDraft[this.dataset.itemId]=Number(this.value)||0;$('packagePreview').innerHTML=packagePreview()"></span></label>`,
      )
      .join("") || '<p class="hint">No matching items.</p>'
  );
}
function packagePreview() {
  const items = draftPackageItems();
  if (!items.length) return '<p class="hint">Set a quantity next to each item to include it.</p>';
  const t = packageTotals({ items, ...(packagePriceDraft !== "" ? { price: Number(packagePriceDraft) } : {}) });
  const free = t.lines.filter((x) => x.free).map((x) => x.qty + " × " + esc(x.item.name));
  return `<div class="pkg-preview"><b>This package:</b> ${esc(packageSummaryName(t.lines))}${me.money ? " · charged " + money(t.price) + " · kit value " + money(t.value) : ""} · weight ${kg(t.weight)}${free.length ? " · free: " + free.join(", ") : ""}${t.noWeight ? ` <span class="muted">(${t.noWeight} without a weight)</span>` : ""}</div>`;
}
let packagePriceDraft = "";
function draftPackageItems() {
  return Object.entries(packageDraft)
    .filter(([id, q]) => q > 0 && db.inventory.some((i) => String(i.id) === id))
    .map(([id, qty]) => ({ id: Number(id), qty, ...(packageFree.has(id) ? { free: true } : {}) }));
}
// "2 × PS10, 1 × Flight case" — what's in a package in one line.
function packageSummaryName(lines) {
  return lines.map((x) => x.qty + " × " + x.item.name).join(", ");
}
function filterPackageItems(q) {
  $("packageItems").innerHTML = packageItemChoices(q);
}
function savePackage(e) {
  e.preventDefault();
  const items = draftPackageItems();
  if (!items.length) return alert("Choose at least one item and quantity.");
  const d = data(e),
    name = d.name.trim(),
    keepTogether = d.keepTogether === "on";
  const editing = db.packages.find((p) => p.id === packageEditing);
  // Staff who can't see money keep whatever package price is already set.
  const price = me.money ? (String(d.price ?? "").trim() === "" ? undefined : Number(d.price)) : editing?.price;
  const fields = { name, items, keepTogether, ...(price !== undefined ? { price } : {}) };
  const next = editing ? db.packages.map((p) => (p === editing ? (({ price: _, ...rest }) => ({ ...rest, ...fields }))(p) : p)) : [...db.packages, { id: uid(), ...fields }];
  try {
    validate({ ...db, packages: next });
  } catch (err) {
    return alert(err.message);
  }
  db.packages = next;
  // Jobs already using this package show its new name.
  if (editing) db.jobs.forEach((j) => (j.kit || []).forEach((k) => String(k.pkgId) === String(editing.id) && ((k.package = name), (k.kept = keepTogether))));
  packageDraft = {};
  packageFree = new Set();
  packagePriceDraft = "";
  packageEditing = null;
  save();
  render();
}
function editPackage(id) {
  const p = db.packages.find((x) => x.id === id);
  packageEditing = id;
  packageDraft = Object.fromEntries(p.items.map((k) => [String(k.id), Number(k.qty)]));
  packageFree = new Set(p.items.filter((k) => k.free).map((k) => String(k.id)));
  packagePriceDraft = hasNum(p.price) ? String(p.price) : "";
  render();
  window.scrollTo(0, 0);
}
function cancelPackageEdit() {
  packageEditing = null;
  packageDraft = {};
  packageFree = new Set();
  packagePriceDraft = "";
  render();
}
function removePackage(id) {
  const p = db.packages.find((x) => x.id === id);
  if (!confirm(`Remove the package ${p.name}?\n\nJobs that already have it keep its kit.${p.keepTogether ? " Its kit goes back into hire stock." : ""}`)) return;
  db.jobs.forEach((j) => (j.kit || []).forEach((k) => String(k.pkgId) === String(id) && (delete k.kept, delete k.pkgId)));
  db.packages = db.packages.filter((p) => p.id !== id);
  save();
  render();
}
// Add a package to the job being edited. Its lines stay grouped under the package name.
function addSelectedPackage() {
  const p = db.packages.find((x) => String(x.id) === $("packagePick").value);
  if (!p) return alert("Choose a saved package first.");
  const instance = uid();
  for (const { qty, item, unit, free } of packagePricing(p, db.inventory).lines) draftKit.push({ item: item.name, qty, price: unit, category: item.category || guessCategory(item.name), package: p.name, pkg: instance, pkgId: p.id, ...(free ? { included: true } : {}), ...(p.keepTogether ? { kept: true } : {}) });
  refreshKit();
}
