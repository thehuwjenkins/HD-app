// Packages: a named set of inventory items added to a job in one go. Price and weight are worked out
// from each item's own hire price and weight × the quantity in the package.
let packageDraft = {},
  packageEditing = null;

function packageLines(p) {
  return p.items
    .map((k) => ({ qty: Number(k.qty) || 0, item: db.inventory.find((i) => String(i.id) === String(k.id)) }))
    .filter((x) => x.item && x.qty > 0);
}
function packageTotals(p) {
  const lines = packageLines(p);
  return {
    lines,
    price: lines.reduce((s, x) => s + x.qty * (Number(x.item.price) || 0), 0),
    weight: Math.round(lines.reduce((s, x) => s + x.qty * (Number(x.item.weightKg) || 0), 0) * 10) / 10,
    noWeight: lines.filter((x) => !hasNum(x.item.weightKg)).length,
    units: lines.reduce((s, x) => s + x.qty, 0),
  };
}
function packageCard(p) {
  const t = packageTotals(p);
  const missing = p.items.length - t.lines.length;
  return `<div class="jobcard package-card"><div class="head"><div><b>${esc(p.name)}</b><div class="muted">${t.units} item${t.units === 1 ? "" : "s"}</div></div>
    <div class="pkg-totals">${me.money ? `<span><span class="muted">Hire price</span><b>${money(t.price)}</b></span>` : ""}<span><span class="muted">Weight</span><b>${kg(t.weight)}</b></span></div></div>
    <details><summary>What's in it</summary><table class="pkg-table"><thead><tr><th>Qty</th><th>Item</th>${me.money ? '<th class="num">Price each</th><th class="num">Line</th>' : ""}<th class="num">Weight</th></tr></thead><tbody>${t.lines
      .map((x) => `<tr><td>${x.qty}</td><td>${esc(x.item.name)}</td>${me.money ? `<td class="num">${money(x.item.price)}</td><td class="num">${money(x.qty * (Number(x.item.price) || 0))}</td>` : ""}<td class="num">${hasNum(x.item.weightKg) ? kg(x.qty * x.item.weightKg) : "—"}</td></tr>`)
      .join("")}</tbody></table>${t.noWeight ? `<p class="hint">${t.noWeight} item${t.noWeight > 1 ? "s have" : " has"} no weight yet, so the weight is low.</p>` : ""}${missing ? `<p class="hint">${missing} item${missing > 1 ? "s are" : " is"} no longer in the inventory.</p>` : ""}</details>
    ${canWrite("packages") ? `<div class="toolbar" style="margin:10px 0 0"><button class="btn small secondary" onclick="editPackage(${p.id})">Edit</button><button class="btn small danger" onclick="removePackage(${p.id})">Remove package</button></div>` : ""}</div>`;
}
function packages() {
  const editing = db.packages.find((p) => p.id === packageEditing);
  return (
    panel(
      editing ? "Edit package" : "Build a package",
      `<p class="hint">A package adds several inventory items to a job in one go. Its price and weight come from each item's hire price and weight × the quantity. Stock is still counted per item.</p>
      <form class="form" onsubmit="savePackage(event)"><label><div class="muted">Package name</div><input class="field" name="name" placeholder="e.g. Small PA — PS10" required value="${esc(editing?.name || "")}"></label><label><div class="muted">Search equipment</div><input class="field" id="packageSearch" placeholder="Search kit" oninput="filterPackageItems(this.value)"></label>
      <div class="wide" id="packageItems">${packageItemChoices("")}</div><div class="wide" id="packagePreview">${packagePreview()}</div>
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
          `<label class="package-choice"><span>${esc(i.name)} <span class="muted">${me.money ? money(i.price) + " · " : ""}${weightText(i)}</span></span><input class="field" type="number" min="0" max="999" value="${packageDraft[i.id] || 0}" data-item-id="${i.id}" aria-label="Quantity of ${esc(i.name)}" oninput="packageDraft[this.dataset.itemId]=Number(this.value)||0;$('packagePreview').innerHTML=packagePreview()"></label>`,
      )
      .join("") || '<p class="hint">No matching items.</p>'
  );
}
function packagePreview() {
  const items = Object.entries(packageDraft).filter(([, q]) => q > 0).map(([id, qty]) => ({ id, qty }));
  if (!items.length) return '<p class="hint">Set a quantity next to each item to include it.</p>';
  const t = packageTotals({ items });
  return `<div class="pkg-preview"><b>This package:</b> ${t.units} item${t.units === 1 ? "" : "s"}${me.money ? " · hire price " + money(t.price) : ""} · weight ${kg(t.weight)}${t.noWeight ? ` <span class="muted">(${t.noWeight} without a weight)</span>` : ""}</div>`;
}
function filterPackageItems(q) {
  $("packageItems").innerHTML = packageItemChoices(q);
}
function savePackage(e) {
  e.preventDefault();
  const items = Object.entries(packageDraft)
    .filter(([id, q]) => q > 0 && db.inventory.some((i) => String(i.id) === id))
    .map(([id, qty]) => ({ id: Number(id), qty }));
  if (!items.length) return alert("Choose at least one item and quantity.");
  const name = data(e).name.trim();
  const editing = db.packages.find((p) => p.id === packageEditing);
  if (editing) Object.assign(editing, { name, items });
  else db.packages.push({ id: uid(), name, items });
  packageDraft = {};
  packageEditing = null;
  save();
  render();
}
function editPackage(id) {
  const p = db.packages.find((x) => x.id === id);
  packageEditing = id;
  packageDraft = Object.fromEntries(p.items.map((k) => [String(k.id), Number(k.qty)]));
  render();
  window.scrollTo(0, 0);
}
function cancelPackageEdit() {
  packageEditing = null;
  packageDraft = {};
  render();
}
function removePackage(id) {
  if (!confirm("Remove this saved package? Existing jobs are unaffected.")) return;
  db.packages = db.packages.filter((p) => p.id !== id);
  save();
  render();
}
// Add a package to the job being edited. Its lines stay grouped under the package name.
function addSelectedPackage() {
  const p = db.packages.find((x) => String(x.id) === $("packagePick").value);
  if (!p) return alert("Choose a saved package first.");
  const instance = uid();
  for (const { qty, item } of packageLines(p)) draftKit.push({ item: item.name, qty, price: Number(item.price) || 0, category: item.category || guessCategory(item.name), package: p.name, pkg: instance });
  refreshKit();
}
