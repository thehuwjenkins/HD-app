function equipmentImage(i) {
  let photo = String(i.photo || "").trim();
  return /^https:\/\//i.test(photo) || /^\/files\/equipment\//.test(photo)
    ? `<img src="${esc(photo)}" alt="${esc(i.name)}" loading="lazy" onerror="this.replaceWith(document.createTextNode('📦'))">`
    : "📦";
}
function equipmentCard(i, add) {
  return `<div class="equipment-card"><div class="equipment-photo">${equipmentImage(i)}</div><div class="equipment-body"><strong>${esc(i.name)}</strong><div class="muted">${Number(i.qty) || 0} owned · ${money(i.price)}</div>${add ? `<button class="btn secondary" type="button" onclick="addKitById(${i.id})">+ Add to job</button>` : `<button class="btn secondary" type="button" onclick="adjustStock(${i.id})">Edit stock</button> <button class="btn secondary" onclick="editEquipmentPhoto(${i.id})">Edit picture</button> <button class="btn secondary" onclick="pickEquipmentPhoto(${i.id})">Upload picture</button>`}</div></div>`;
}
function inventory() {
  let matches = db.inventory.filter((i) => i.name.toLowerCase().includes(inventoryQuery.toLowerCase()));
  let content = `<div class="inventory-tools"><input class="field" placeholder="Search kit by name..." value="${esc(inventoryQuery)}" oninput="inventoryQuery=this.value;updateInventoryResults()"><div class="view-switch"><button class="btn secondary ${inventoryView === "grid" ? "active" : ""}" onclick="inventoryView='grid';updateInventoryResults()">▦ Grid</button><button class="btn secondary ${inventoryView === "list" ? "active" : ""}" onclick="inventoryView='list';updateInventoryResults()">☰ List</button></div></div><div id="inventoryResults">${inventoryResults(matches)}</div>`;
  return panel(
    "Kit / Inventory",
    content +
      `<details style="margin-top:22px"><summary style="cursor:pointer;font-weight:bold">+ Add equipment to inventory</summary><div style="margin-top:15px">${form(
        [
          { name: "name", label: "Equipment name" },
          { name: "qty", label: "Quantity owned", type: "number", min: 0 },
          { name: "service", label: "Out for service", type: "number", min: 0 },
          { name: "price", label: "Default hire price (£)", type: "number", min: 0, required: false },
          { name: "photo", label: "Picture URL (optional)", required: false },
        ],
        "addItem",
        "Add equipment",
      )}</div></details><p class="muted">Images are optional. Add a direct HTTPS picture URL to an equipment item. The demo does not upload or store image files.</p>`,
  );
}
function inventoryResults(matches) {
  return inventoryView === "grid"
    ? `<div class="equipment-grid">${matches.map((i) => equipmentCard(i, false)).join("")}</div>`
    : `<div class="tablewrap"><table><thead><tr><th>Equipment</th><th>Default price</th><th>Owned</th><th>Out of service</th><th>Available before bookings</th><th>Picture</th></tr></thead><tbody>${matches.map((i) => `<tr><td>${esc(i.name)}</td><td>${money(i.price)}</td><td>${i.qty}</td><td>${i.service}</td><td>${Math.max(0, i.qty - i.service)}</td><td><button class="btn secondary" onclick="adjustStock(${i.id})">Stock</button> <button class="btn secondary" onclick="editEquipmentPhoto(${i.id})">Picture</button></td></tr>`).join("")}</tbody></table></div>`;
}
function updateInventoryResults() {
  let el = $("inventoryResults");
  if (el)
    el.innerHTML = inventoryResults(
      db.inventory.filter((i) => i.name.toLowerCase().includes(inventoryQuery.toLowerCase())),
    );
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
function addItem(e) {
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
    photo: /^https:\/\//i.test(d.photo || "") ? d.photo : "",
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
