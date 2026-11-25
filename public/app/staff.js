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
          const access = me.owner ? `<div class="access-line"><span class="muted">Access:</span> ${staffAccessSelect(m, `setStaffAccess(${m.id},this.value)`) || `<span class="muted">${esc(staffAccessText(m))}</span>`}</div>` : "";
          return row(`<b>${esc(m.name)}</b><div class="muted">${esc(m.role || "")}${m.email ? " · " + esc(m.email) : " · no email (can't sign in)"}${jobs ? ` · ${jobs} upcoming job${jobs > 1 ? "s" : ""}` : ""}</div>${access}`, `<button class="btn small secondary" onclick="editStaff(${m.id})">Edit</button> <button class="btn small danger" onclick="removeStaff(${m.id})">Remove</button>`);
        })
        .join("") + `<p class="hint">Adding someone with an email lets them sign in. Choose their access next to their name: crew see only their own jobs; team members use the parts of HQ you choose. Removing them, or their email, stops their sign-in.</p>`,
  );
}
function editStaff(id) {
  const m = db.staff.find((x) => x.id === id);
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "staffDialog";
  root.innerHTML = `<form class="panel" onsubmit="saveStaff(event,${id})"><div class="line"><h2 style="margin:0">Edit ${esc(m.name)}</h2><button type="button" class="btn small ghost" onclick="$('staffDialog').remove()">Close</button></div>
    <div class="form" style="margin-top:14px"><label><span class="muted">Name</span><input class="field" name="name" required value="${esc(m.name)}"></label><label><span class="muted">Role / speciality</span><input class="field" name="role" value="${esc(m.role || "")}"></label><label class="wide"><span class="muted">Email (they sign in with this)</span><input class="field" name="email" type="email" value="${esc(m.email || "")}"></label>${me.owner && staffAccessSelect(m, "") ? `<label class="wide"><span class="muted">Access</span>${staffAccessSelect(m, "").replace('class="field access-level"', 'class="field access-level" name="access"')}<span class="hint">Crew see only their own jobs. Team members use the parts of HQ you choose.</span></label>` : ""}</div>
    <button class="btn big" type="submit">Save</button></form>`;
  document.body.appendChild(root);
}
function saveStaff(e, id) {
  e.preventDefault();
  const d = data(e);
  const m = db.staff.find((x) => x.id === id), oldEmail = m.email;
  Object.assign(m, { name: d.name.trim(), role: d.role.trim(), email: d.email.trim().toLowerCase() });
  if (me.owner) syncMemberFromStaff(oldEmail, m);
  $("staffDialog").remove();
  if (me.owner && d.access && d.access !== staffAccessLevel(m) && m.email) return setStaffAccess(id, d.access);
  save();
  render();
}
// Removing someone takes them off their jobs and crew bookings, and stops their sign-in.
function removeStaff(id) {
  const m = db.staff.find((x) => x.id === id);
  const jobs = db.jobs.filter((j) => String(j.staffId) === String(id));
  const invites = db.crewInvites.filter((i) => String(i.staffId) === String(id));
  if (!confirm(`Remove ${m.name}?` + (jobs.length ? `\n\nThey'll be taken off ${jobs.length} job${jobs.length > 1 ? "s" : ""}: ${jobs.slice(0, 4).map((j) => j.title).join(", ")}${jobs.length > 4 ? "…" : ""}.` : "") + (invites.length ? `\n${invites.length} crew booking${invites.length > 1 ? "s" : ""} will be removed.` : "") + (m.email ? "\n\nThey will no longer be able to sign in" + (staffAccessLevel(m).startsWith("p") || staffAccessLevel(m) === "custom" ? ", and their team access is removed." : ".") : ""))) return;
  jobs.forEach((j) => delete j.staffId);
  db.crewInvites = db.crewInvites.filter((i) => !invites.includes(i));
  db.staff = db.staff.filter((x) => x.id !== id);
  if (me.owner) syncMemberFromStaff(m.email, { email: "" });
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
// Crew invites: prepare one per person, send it by email, and see their reply (they accept or decline
// on their "My jobs" page after signing in with the email address the invite went to).
const INVITE_STATUS = { "Not sent": ["Not sent yet", ""], Invited: ["Invited · waiting for a reply", "warning"], Accepted: ["Accepted", "success"], Declined: ["Declined", "danger-tag"] };
const inviteStatus = (i) => (i.status === "Draft — not sent" || !i.status ? "Not sent" : i.status);
function crewInviteEditor(jobId) {
  const j = db.jobs.find((x) => String(x.id) === String(jobId));
  if (!j) return;
  const existing = db.crewInvites.filter((i) => String(i.jobId) === String(jobId));
  document.getElementById("crewInviteModal")?.remove();
  const root = document.createElement("div");
  root.id = "crewInviteModal";
  root.className = "modal";
  const cards = existing
    .map((i) => {
      const m = db.staff.find((x) => String(x.id) === String(i.staffId));
      const [label, cls] = INVITE_STATUS[inviteStatus(i)] || [i.status, ""];
      const when = i.respondedAt || i.sentAt;
      return `<div class="crew-invite"><div class="line" style="border:0;padding:0"><div><b>${esc(m?.name || "Crew member")}</b>${me.money ? " · " + money(i.fee) : ""}<div class="muted">${esc(m?.email || "No email address: add one under Staff")}</div></div><span class="tag ${cls}">${esc(label)}${when ? " · " + fmtDay(String(when).slice(0, 10), { day: "numeric", month: "short" }) : ""}</span></div>
        ${i.requirements ? `<p>${esc(i.requirements)}</p>` : ""}
        <div class="toolbar" style="margin:8px 0 0"><button class="btn small" onclick="openInviteEmail(${i.id})">${inviteStatus(i) === "Not sent" ? "Send invite" : "Send again"}</button>${me.money ? `<button class="btn small secondary" onclick="editCrewFee(${i.id})">Edit fee</button>` : ""}<button class="btn small ghost" onclick="removeCrewInvite(${i.id})">Remove</button></div></div>`;
    })
    .join("");
  root.innerHTML = `<div class="panel" style="max-width:760px;margin:auto"><div class="line"><h2 style="margin:0">Crew · ${esc(j.title)}</h2><button class="btn small ghost" onclick="closeCrewInvite()">Close</button></div>
    <p class="hint">Add each person and press <b>Send invite</b>: it opens an email to them with the job details and fee. They sign in at ${esc(location.host)} with that email address and accept or decline. Accepted jobs appear on their "My jobs" page, with damage reports, debrief and photo uploads.</p>
    <form onsubmit="saveCrewInvite(event,${j.id})" class="form"><label><span class="muted">Crew member</span><select name="staffId" class="field" required><option value="">Select person</option>${db.staff.map((m) => `<option value="${m.id}">${esc(m.name)}${m.email ? "" : " (no email)"}</option>`).join("")}</select></label><label class="money-only"><span class="muted">Fixed fee for the whole job (£)</span><input name="fee" class="field" type="number" min="0" step="0.01" ${me.money ? "required" : 'value="0"'}></label><label class="wide"><span class="muted">Role / what you need from them</span><textarea name="requirements" class="field" rows="3" placeholder="e.g. FOH engineer, arrive at 08:00, black clothing"></textarea></label><div class="wide"><button class="btn" type="submit">Add to crew</button></div></form>
    <h3>Crew for this job</h3>${cards || '<p class="hint">Nobody invited yet.</p>'}</div>`;
  document.body.appendChild(root);
}
function closeCrewInvite() {
  document.getElementById("crewInviteModal")?.remove();
}
function saveCrewInvite(e, jobId) {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  if (db.crewInvites.some((i) => String(i.jobId) === String(jobId) && String(i.staffId) === String(d.staffId))) return alert("This person is already on the crew list for this job.");
  const inv = { id: uid(), jobId, staffId: d.staffId, fee: Number(d.fee) || 0, requirements: d.requirements, status: "Not sent" };
  db.crewInvites.push(inv);
  save();
  crewInviteEditor(jobId);
  const m = db.staff.find((x) => String(x.id) === String(d.staffId));
  if (m?.email && confirm(`Send the invite to ${m.name} now?`)) openInviteEmail(inv.id);
}
function removeCrewInvite(id) {
  const i = db.crewInvites.find((x) => String(x.id) === String(id));
  const m = db.staff.find((x) => String(x.id) === String(i.staffId));
  if (!confirm(`Take ${m?.name || "this person"} off the crew for this job?${inviteStatus(i) === "Accepted" ? " They had accepted, so let them know." : ""}`)) return;
  db.crewInvites = db.crewInvites.filter((x) => x !== i);
  save();
  crewInviteEditor(i.jobId);
}
// The invite email: opens in Gmail or the email app, with the job details and how to reply.
function openInviteEmail(id) {
  const i = db.crewInvites.find((x) => String(x.id) === String(id));
  const j = db.jobs.find((x) => String(x.id) === String(i.jobId));
  const m = db.staff.find((x) => String(x.id) === String(i.staffId));
  if (!m?.email) return alert(`${m?.name || "This person"} has no email address. Add one under Staff first: they sign in with it to accept.`);
  const co = db.company?.name || "HD Events";
  const body = `Hi ${m.name.split(" ")[0]},\n\nWould you like to work on ${j.title}?\n\nWhen: ${fmtRange(j)}${j.venue ? "\nWhere: " + j.venue : ""}${j.load ? "\nSchedule: " + j.load : ""}${i.requirements ? "\nWhat we need: " + i.requirements : ""}\nFee for the whole job: ${"£" + (Number(i.fee) || 0).toFixed(2)}\n\nTo accept or decline, sign in at ${location.origin} with this email address (${m.email}). You'll be sent a code to sign in, then the invite is at the top of your jobs.\n\nThanks,\n${co}`;
  document.getElementById("inviteEmail")?.remove();
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "inviteEmail";
  root.innerHTML = `<div class="panel send-dialog"><div class="line"><h2 style="margin:0">Send crew invite · ${esc(m.name)}</h2><button class="btn small ghost" onclick="$('inviteEmail').remove()">Close</button></div>
    <div class="form" style="margin-top:12px"><label class="wide"><span class="muted">To</span><input class="field" id="sendTo" value="${esc(m.email)}"></label><label class="wide"><span class="muted">Subject</span><input class="field" id="sendSubject" value="${esc("Crew invite: " + j.title)}"></label><label class="wide"><span class="muted">Message</span><textarea class="field" id="sendBody" rows="13">${esc(body)}</textarea></label></div>
    <div class="toolbar"><button class="btn" onclick="sendInviteVia('gmail',${i.id})">Open in Gmail</button><button class="btn secondary" onclick="sendInviteVia('mailto',${i.id})">Open in email app</button><button class="btn secondary" onclick="copySend()">Copy message</button></div></div>`;
  document.body.appendChild(root);
}
function sendInviteVia(how, id) {
  const to = $("sendTo").value.trim(),
    su = $("sendSubject").value,
    body = $("sendBody").value;
  const url = how === "gmail" ? "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(to) + "&su=" + encodeURIComponent(su) + "&body=" + encodeURIComponent(body) : "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent(su) + "&body=" + encodeURIComponent(body);
  if (how === "gmail") window.open(url, "_blank", "noopener");
  else location.href = url;
  const i = db.crewInvites.find((x) => String(x.id) === String(id));
  if (inviteStatus(i) !== "Accepted") i.status = "Invited";
  i.sentAt = new Date().toISOString();
  save();
  $("inviteEmail")?.remove();
  crewInviteEditor(i.jobId);
  toast("Invite ready to send in your email");
}
function editCrewFee(id) {
  const i = db.crewInvites.find((x) => String(x.id) === String(id));
  if (!i) return;
  const v = prompt("New fixed fee for the whole job (£)", i.fee);
  if (v === null) return;
  if (v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 0) return alert("Enter a valid amount.");
  i.fee = Number(v);
  save();
  crewInviteEditor(i.jobId);
  if (inviteStatus(i) !== "Not sent" && confirm("The fee has changed. Send them an updated invite?")) openInviteEmail(i.id);
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
