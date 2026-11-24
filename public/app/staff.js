function staff() {
  return panel(
    "Staff & freelancers",
    form(
      [
        { name: "name", label: "Name" },
        { name: "role", label: "Role / speciality", required: false },
        { name: "email", label: "Email", type: "email", required: false },
      ],
      "addStaff",
      "Add staff member",
    ) +
      db.staff
        .map((m) => {
          const jobs = db.jobs.filter((j) => String(j.staffId) === String(m.id) && !["returned", "invoiced"].includes(stageOf(j))).length;
          return row(`<b>${esc(m.name)}</b><div class="muted">${esc(m.role || "")}${m.email ? " · " + esc(m.email) : " · no email (can't sign in)"}${jobs ? ` · ${jobs} upcoming job${jobs > 1 ? "s" : ""}` : ""}</div>`, `<button class="btn small secondary" onclick="editStaff(${m.id})">Edit</button> <button class="btn small danger" onclick="removeStaff(${m.id})">Remove</button>`);
        })
        .join("") + `<p class="hint">Adding someone with an email lets them sign in to see their own jobs. Removing them, or their email, stops their sign-in.</p>`,
  );
}
function editStaff(id) {
  const m = db.staff.find((x) => x.id === id);
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "staffDialog";
  root.innerHTML = `<form class="panel" onsubmit="saveStaff(event,${id})"><div class="line"><h2 style="margin:0">Edit ${esc(m.name)}</h2><button type="button" class="btn small ghost" onclick="$('staffDialog').remove()">Close</button></div>
    <div class="form" style="margin-top:14px"><label><span class="muted">Name</span><input class="field" name="name" required value="${esc(m.name)}"></label><label><span class="muted">Role / speciality</span><input class="field" name="role" value="${esc(m.role || "")}"></label><label class="wide"><span class="muted">Email (they sign in with this)</span><input class="field" name="email" type="email" value="${esc(m.email || "")}"></label></div>
    <button class="btn big" type="submit">Save</button></form>`;
  document.body.appendChild(root);
}
function saveStaff(e, id) {
  e.preventDefault();
  const d = data(e);
  Object.assign(db.staff.find((x) => x.id === id), { name: d.name.trim(), role: d.role.trim(), email: d.email.trim().toLowerCase() });
  $("staffDialog").remove();
  save();
  render();
}
// Removing someone takes them off their jobs and crew bookings, and stops their sign-in.
function removeStaff(id) {
  const m = db.staff.find((x) => x.id === id);
  const jobs = db.jobs.filter((j) => String(j.staffId) === String(id));
  const invites = db.crewInvites.filter((i) => String(i.staffId) === String(id));
  if (!confirm(`Remove ${m.name}?` + (jobs.length ? `\n\nThey'll be taken off ${jobs.length} job${jobs.length > 1 ? "s" : ""}: ${jobs.slice(0, 4).map((j) => j.title).join(", ")}${jobs.length > 4 ? "…" : ""}.` : "") + (invites.length ? `\n${invites.length} crew booking${invites.length > 1 ? "s" : ""} will be removed.` : "") + (m.email ? "\n\nThey will no longer be able to sign in." : ""))) return;
  jobs.forEach((j) => delete j.staffId);
  db.crewInvites = db.crewInvites.filter((i) => !invites.includes(i));
  db.staff = db.staff.filter((x) => x.id !== id);
  save();
  render();
}
function addStaff(e) {
  e.preventDefault();
  db.staff.push({ id: uid(), ...data(e) });
  save();
  render();
}
function crewPortal() {
  let who = window.crewPreviewId || "";
  let assigned = db.jobs.filter((j) => String(j.staffId) === String(who) && who);
  return panel(
    "Crew portal · preview",
    `<p class="hint">Owner preview. Staff sign in with their own email to see their assigned schedule.</p><label class="muted">Preview assigned work for</label><select class="field" onchange="window.crewPreviewId=this.value;render()"><option value="">Select crew member</option>${db.staff.map((m) => `<option value="${m.id}" ${String(who) === String(m.id) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>` +
      (who
        ? assigned
            .map(
              (j) =>
                `<div class="jobcard"><b>${esc(j.title)}</b> ${stageTag(j)}<p>${esc(fmtRange(j))} · ${esc(j.venue || "Venue not set")}</p><p class="muted">${esc(j.load || "Schedule not set")}</p><p class="muted">${esc(j.notes || "")}</p><button class="btn secondary" onclick="printJob(${j.id})">Print prep sheet</button></div>`,
            )
            .join("") || '<p class="empty">No assigned jobs.</p>'
        : '<p class="empty">Choose a crew member to preview their schedule.</p>'),
  );
}
function crewInviteEditor(jobId) {
  let j = db.jobs.find((x) => String(x.id) === String(jobId));
  if (!j) return;
  let existing = db.crewInvites.filter((i) => String(i.jobId) === String(jobId));
  let root = document.createElement("div");
  root.id = "crewInviteModal";
  root.style.cssText =
    "position:fixed;inset:0;background:#060b15df;z-index:1000;overflow:auto;padding:5vh 12px";
  root.innerHTML = `<div class="panel" style="max-width:720px;margin:auto"><div class="line"><h2>Crew invitations · ${esc(j.title)}</h2><button class="btn secondary" onclick="closeCrewInvite()">Close</button></div><p class="hint">Prepare an invitation for one person at a time. This local prototype does not send email or accept live responses.</p><form onsubmit="saveCrewInvite(event,${j.id})" class="form"><label><span class="muted">Crew member</span><select name="staffId" class="field" required><option value="">Select person</option>${db.staff.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select></label><label class="money-only"><span class="muted">Fixed fee for entire job (£)</span><input name="fee" class="field" type="number" min="0" step="0.01" ${me.money ? "required" : "value=\"0\""}></label><label class="wide"><span class="muted">Role / requirements for this crew member</span><textarea name="requirements" class="field" rows="3" placeholder="e.g. FOH engineer, arrive at 08:00"></textarea></label><div class="wide"><button class="btn" type="submit">Save invitation draft</button></div></form><h2>Saved invitations</h2>${
    existing.length
      ? existing
          .map((i) => {
            let m = db.staff.find((x) => String(x.id) === String(i.staffId));
            return `<div class="crew-invite"><b>${esc(m?.name || "Crew member")}</b> · ${money(i.fee)}<div class="muted">${esc(i.status || "Draft — not sent")}</div><p>${esc(i.requirements || "")}</p><button class="btn secondary" onclick="previewCrewInvite(${i.id})">Preview invitation</button> ${me.money ? `<button class="btn secondary" onclick="editCrewFee(${i.id})">Edit fee</button>` : ""}</div>`;
          })
          .join("")
      : '<p class="hint">No invitations prepared yet.</p>'
  }</div>`;
  document.body.appendChild(root);
}
function closeCrewInvite() {
  document.getElementById("crewInviteModal")?.remove();
}
function saveCrewInvite(e, jobId) {
  e.preventDefault();
  let d = Object.fromEntries(new FormData(e.target));
  let existing = db.crewInvites.find(
    (i) => String(i.jobId) === String(jobId) && String(i.staffId) === String(d.staffId),
  );
  if (existing) {
    alert("An invitation draft for this person already exists. Use Edit fee.");
    return;
  }
  db.crewInvites.push({
    id: uid(),
    jobId,
    staffId: d.staffId,
    fee: Number(d.fee),
    requirements: d.requirements,
    status: "Draft — not sent",
  });
  save();
  closeCrewInvite();
  crewInviteEditor(jobId);
}
function editCrewFee(id) {
  let i = db.crewInvites.find((x) => String(x.id) === String(id));
  if (!i) return;
  let v = prompt("New fixed total job fee (£)", i.fee);
  if (v === null) return;
  if (v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 0) {
    alert("Enter a valid amount.");
    return;
  }
  i.fee = Number(v);
  i.status = "Draft — not sent";
  save();
  closeCrewInvite();
  crewInviteEditor(i.jobId);
}
function previewCrewInvite(id) {
  let i = db.crewInvites.find((x) => String(x.id) === String(id));
  if (!i) return;
  let j = db.jobs.find((x) => String(x.id) === String(i.jobId));
  let m = db.staff.find((x) => String(x.id) === String(i.staffId));
  if (!j) return;
  let popup = window.open("", "_blank");
  if (!popup) {
    alert("Allow pop-ups to preview the invitation.");
    return;
  }
  popup.document.open();
  popup.document.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>Crew invitation preview</title></head><body style="font:16px Arial;max-width:650px;margin:45px auto;line-height:1.6"><h1>HD EVENTS · Crew invitation preview</h1><p><b>To:</b> ' +
      esc(m?.name || "Crew member") +
      "</p><h2>" +
      esc(j.title) +
      "</h2><p><b>Location:</b> " +
      esc(j.venue || "To be confirmed") +
      "<br><b>Dates:</b> " +
      esc(j.start) +
      " to " +
      esc(j.end) +
      "<br><b>Schedule:</b> " +
      esc(j.load || "To be confirmed") +
      "<br><b>Requirements:</b> " +
      esc(i.requirements || "To be confirmed") +
      "</p><h2>Fixed fee for entire job: " +
      money(i.fee) +
      '</h2><p><button disabled>Accept job (available after hosting)</button> <button disabled>Decline job (available after hosting)</button></p><p style="color:#777">Preview only. No invitation has been sent.</p></body></html>',
  );
  popup.document.close();
}
