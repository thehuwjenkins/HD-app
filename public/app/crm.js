function clientName(id) {
  return db.clients.find((c) => String(c.id) === String(id))?.name || "";
}
function clientOptions(selected) {
  return (
    `<option value="">Select client</option>` +
    db.clients
      .map(
        (c) =>
          `<option value="${c.id}" ${String(c.id) === String(selected) ? "selected" : ""}>${esc(c.name)}${c.company ? " — " + esc(c.company) : ""}</option>`,
      )
      .join("")
  );
}
function crm() {
  let c = db.clients.find((x) => x.id === activeClient);
  if (c) {
    let related = db.jobs.filter(
      (j) => String(j.clientId) === String(c.id) || (!j.clientId && j.client === c.name),
    );
    return `<div class="toolbar"><button class="btn secondary" onclick="activeClient=null;render()">← All contacts</button></div>${panel("Contact · " + esc(c.name), `<div class="jobmeta"><div><b>Company</b><p>${esc(c.company || "—")}</p></div><div><b>Email</b><p>${esc(c.email || "—")}</p></div><div><b>Phone</b><p>${esc(c.phone || "—")}</p></div></div><div class="toolbar" style="margin-top:16px"><select class="field" style="max-width:220px" id="clientAction"><option value="quote">New quote</option><option value="invoice">New invoice</option></select><button class="btn" onclick="clientAction()">Create</button><button class="btn secondary" onclick="newClientJob(${c.id})">New job</button></div><p class="hint">Invoice creation is planned for the hosted version. Quotes are built from a job.</p>`)}${panel("Jobs attached to this contact", related.length ? related.map((j) => row(`<b>${esc(j.title)}</b><div class="muted">${esc(j.start)} · ${esc(j.venue)}</div>`, `<button class="btn secondary" onclick="go('Jobs');editJob(${j.id})">Open</button>`)).join("") : '<p class="muted">No jobs linked to this contact yet.</p>')}`;
  }
  return panel(
    "Contacts",
    form(
      [
        { name: "name", label: "Contact name" },
        { name: "company", label: "Company", required: false },
        { name: "email", label: "Email", type: "email", required: false },
        { name: "phone", label: "Phone", required: false },
        { name: "address", label: "Postal address", required: false },
      ],
      "addClient",
      "Add contact",
    ) +
      `<input class="field" placeholder="Search contacts..." oninput="filterContacts(this.value)"><div id="contactsList">${contactsList("")}</div>`,
  );
}
function contactsList(q) {
  return (
    db.clients
      .filter((c) => (c.name + " " + c.company + " " + c.email).toLowerCase().includes(q.toLowerCase()))
      .map((c) =>
        row(
          `<b>${esc(c.name)}</b><div class="muted">${esc(c.company || "")} · ${esc(c.email || "")}</div>`,
          `<button class="btn secondary" onclick="activeClient=${c.id};render()">Open contact</button>`,
        ),
      )
      .join("") ||
    '<div class="empty">No matching contacts. Your 17hats records have not been imported.</div>'
  );
}
function filterContacts(q) {
  $("contactsList").innerHTML = contactsList(q);
}
function clientAction() {
  let v = $("clientAction").value;
  if (v === "invoice") {
    alert("Invoices are made from the job: open Jobs and press Invoice on the job card.");
    return;
  }
  newClientJob(activeClient);
}
function newClientJob(id) {
  editingJob = null;
  draftKit = [];
  go("Jobs");
  let f = $("jobForm");
  if (f) f.elements.clientId.value = id;
}
function addClient(e) {
  e.preventDefault();
  db.clients.push({ id: uid(), ...data(e) });
  save();
  render();
}
function quickClient() {
  let name = prompt("New client name");
  if (!name) return;
  let company = prompt("Company (optional)") || "";
  let email = prompt("Email (optional)") || "";
  let c = { id: uid(), name, company, email };
  db.clients.push(c);
  save();
  let sel = document.querySelector('#jobForm select[name="clientId"]');
  sel.insertAdjacentHTML("beforeend", `<option value="${c.id}">${esc(name)}</option>`);
  sel.value = c.id;
}
