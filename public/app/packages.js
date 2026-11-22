function packages() {
  return panel(
    "Smart equipment packages",
    `<p class="hint">A package adds several existing inventory items to a job in one action. Stock is counted per individual item.</p><form class="form" onsubmit="savePackage(event)"><label><div class="muted">Package name</div><input class="field" name="name" placeholder="e.g. Small PA — PS10" required></label><label><div class="muted">Search equipment</div><input class="field" id="packageSearch" placeholder="Search kit" oninput="filterPackageItems(this.value)"></label><div class="wide" id="packageItems">${packageItemChoices("")}</div><div class="wide"><button class="btn" type="submit">Save package</button></div></form>` +
      db.packages
        .map(
          (p) =>
            `<div class="jobcard"><b>${esc(p.name)}</b><p class="muted">${p.items.map((k) => `${Number(k.qty)} × ${esc(db.inventory.find((i) => String(i.id) === String(k.id))?.name || "Item no longer in inventory")}`).join(" · ")}</p><button class="btn secondary" onclick="removePackage(${p.id})">Remove package</button></div>`,
        )
        .join(""),
  );
}
function packageItemChoices(q) {
  return (
    db.inventory
      .filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
      .map(
        (i) =>
          `<label class="package-choice"><span>${esc(i.name)}</span><input class="field" type="number" min="0" max="999" value="0" data-item-id="${i.id}" aria-label="Quantity of ${esc(i.name)}"></label>`,
      )
      .join("") || '<p class="hint">No matching items.</p>'
  );
}
let packageDraft = {};
function filterPackageItems(q) {
  document.querySelectorAll("#packageItems [data-item-id]").forEach((el) => {
    packageDraft[el.dataset.itemId] = Number(el.value) || 0;
  });
  $("packageItems").innerHTML = packageItemChoices(q);
  document.querySelectorAll("#packageItems [data-item-id]").forEach((el) => {
    el.value = packageDraft[el.dataset.itemId] || 0;
  });
}
function savePackage(e) {
  e.preventDefault();
  document.querySelectorAll("#packageItems [data-item-id]").forEach((el) => {
    packageDraft[el.dataset.itemId] = Number(el.value) || 0;
  });
  let items = Object.entries(packageDraft)
    .filter(([id, q]) => q > 0 && db.inventory.some((i) => String(i.id) === id))
    .map(([id, qty]) => ({ id, qty }));
  if (!items.length) {
    alert("Choose at least one item and quantity.");
    return;
  }
  db.packages.push({ id: uid(), name: data(e).name, items });
  packageDraft = {};
  save();
  render();
}
function removePackage(id) {
  if (!confirm("Remove this saved package? Existing jobs are unaffected.")) return;
  db.packages = db.packages.filter((p) => p.id !== id);
  save();
  render();
}
function addSelectedPackage() {
  let p = db.packages.find((p) => String(p.id) === $("packagePick").value);
  if (!p) {
    alert("Choose a saved package first.");
    return;
  }
  for (let k of p.items) {
    let i = db.inventory.find((i) => String(i.id) === String(k.id));
    if (!i) continue;
    let cat = $("kitCategory").value;
    let existing = draftKit.find((x) => x.item === i.name && x.category === cat);
    if (existing) existing.qty += Number(k.qty);
    else draftKit.push({ item: i.name, qty: Number(k.qty), price: Number(i.price) || 0, category: cat });
  }
  refreshKit();
}
