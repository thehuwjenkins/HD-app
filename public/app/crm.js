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
    return `<div class="toolbar"><button class="btn secondary" onclick="activeClient=null;render()">← All contacts</button></div>${panel("Contact · " + esc(c.name), `<div class="jobmeta"><div><b>Company</b><p>${esc(c.company || "—")}</p></div><div><b>Email</b><p>${esc(c.email || "—")}</p></div><div><b>Phone</b><p>${esc(c.phone || "—")}</p></div><div><b>Address</b><p>${esc(c.address || "—")}</p></div></div><div class="toolbar" style="margin-top:16px"><button class="btn" onclick="newClientJob(${c.id})">New job for this client</button><button class="btn secondary" onclick="editClient(${c.id})">Edit contact</button><button class="btn danger" onclick="deleteClient(${c.id})">Delete contact</button></div><p class="hint">Quotes and invoices are made from the job, so they always match its kit and prices.</p>`)}${panel("Jobs for this contact", related.length ? related.map((j) => row(`<b>${esc(j.title)}</b><div class="muted">${esc(fmtRange(j))}${j.venue ? " · " + esc(j.venue) : ""}</div>`, `${stageTag(j)} <button class="btn small secondary" onclick="openJob(${j.id})">Open</button>`)).join("") : '<p class="muted">No jobs linked to this contact yet.</p>')}`;
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
  newJob();
  let f = $("jobForm");
  if (f) f.elements.clientId.value = id;
}
// Edit a contact: its jobs show the new name straight away.
function editClient(id) {
  const c = db.clients.find((x) => x.id === id);
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "clientDialog";
  const f = (k, l, type = "text") => `<label><span class="muted">${l}</span><input class="field" name="${k}" type="${type}" value="${esc(c[k] || "")}" ${k === "name" ? "required" : ""}></label>`;
  root.innerHTML = `<form class="panel" onsubmit="saveClient(event,${id})"><div class="line"><h2 style="margin:0">Edit contact</h2><button type="button" class="btn small ghost" onclick="$('clientDialog').remove()">Close</button></div>
    <div class="form" style="margin-top:14px">${f("name", "Contact name")}${f("company", "Company")}${f("email", "Email", "email")}${f("phone", "Phone", "tel")}<label class="wide"><span class="muted">Postal address</span><textarea class="field" name="address" rows="2">${esc(c.address || "")}</textarea></label></div>
    <button class="btn big" type="submit">Save contact</button></form>`;
  document.body.appendChild(root);
}
function saveClient(e, id) {
  e.preventDefault();
  const c = db.clients.find((x) => x.id === id),
    d = data(e),
    oldName = c.name;
  Object.assign(c, { name: d.name.trim(), company: d.company.trim(), email: d.email.trim(), phone: d.phone.trim(), address: d.address.trim() });
  db.jobs.forEach((j) => {
    if (String(j.clientId) === String(id) || (!j.clientId && j.client === oldName)) {
      j.client = c.name;
      j.clientId ??= c.id;
    }
  });
  $("clientDialog").remove();
  save();
  render();
}
// Delete a contact. Their jobs keep the name (for invoices already sent) but are no longer linked.
function deleteClient(id) {
  const c = db.clients.find((x) => x.id === id);
  const jobs = db.jobs.filter((j) => String(j.clientId) === String(id));
  if (!confirm(`Delete ${c.name}?` + (jobs.length ? `\n\n${jobs.length} job${jobs.length > 1 ? "s keep" : " keeps"} the name "${c.name}" but will no longer be linked to a contact, so quotes and invoices won't show their email or address.` : ""))) return;
  jobs.forEach((j) => {
    j.client = c.name;
    delete j.clientId;
  });
  db.clients = db.clients.filter((x) => x.id !== id);
  activeClient = null;
  save();
  render();
}
function addClient(e) {
  e.preventDefault();
  db.clients.push({ id: uid(), ...data(e) });
  save();
  render();
}
// "Create client" from the job form: a full contact, then linked to the job straight away.
function quickClient() {
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "clientDialog";
  root.innerHTML = `<form class="panel" onsubmit="saveQuickClient(event)"><div class="line"><h2 style="margin:0">Create client</h2><button type="button" class="btn small ghost" onclick="$('clientDialog').remove()">Close</button></div>
    <div class="form" style="margin-top:14px">
      <label><span class="muted">Contact name</span><input class="field" name="name" required autocomplete="off"></label>
      <label><span class="muted">Company (optional)</span><input class="field" name="company"></label>
      <label><span class="muted">Email (for quotes and invoices)</span><input class="field" name="email" type="email"></label>
      <label><span class="muted">Phone</span><input class="field" name="phone" type="tel"></label>
      <label class="wide"><span class="muted">Postal address (shown on invoices)</span><textarea class="field" name="address" rows="2"></textarea></label>
    </div><button class="btn big" type="submit">Create client and add to job</button></form>`;
  document.body.appendChild(root);
  root.querySelector("input[name=name]").focus();
}
function saveQuickClient(e) {
  e.preventDefault();
  const d = data(e);
  const c = { id: uid(), name: d.name.trim(), company: d.company.trim(), email: d.email.trim(), phone: d.phone.trim(), address: d.address.trim() };
  db.clients.push(c);
  save();
  $("clientDialog").remove();
  const sel = document.querySelector('#jobForm select[name="clientId"]');
  if (sel) {
    sel.insertAdjacentHTML("beforeend", `<option value="${c.id}">${esc(c.name)}${c.company ? " — " + esc(c.company) : ""}</option>`);
    sel.value = c.id;
  }
  toast("Client <b>" + esc(c.name) + "</b> created and added to the job");
}
