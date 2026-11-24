// People & access (owner only): team members and the areas they can use, and the Cloudflare sign-in list.
const ACCESS_AREAS = [
  ["overview", "Overview", "The dashboard of what's coming up."],
  ["planner", "Event Planner", "Plans, checklists, site maps, posters, safety documents, suppliers."],
  ["jobs", "Jobs, pipeline & calendar", "Create and move jobs, kit lists, crew bookings, cross-hire."],
  ["tasks", "Tasks & projects", "My Workday and Projects."],
  ["kit", "Kit & packages", "Inventory, packages and cross-hire."],
  ["people", "Staff & contacts", "Staff, crew portal preview and client contacts."],
  ["money", "Money", "Prices, totals, quotes, discounts and crew fees. Without this, money shows as —."],
];
const ACCESS_PRESETS = [
  ["Event planner only", ["overview", "planner"]],
  ["Everything except money", ["overview", "planner", "jobs", "tasks", "kit", "people"]],
  ["Everything", ACCESS_AREAS.map(([k]) => k)],
];
let accessInfo = null;

function accessMembers() {
  db.access = db.access && Array.isArray(db.access.members) ? db.access : { members: [] };
  return db.access.members;
}
async function loadAccessInfo() {
  try {
    const r = await fetch("/api/access/status");
    accessInfo = r.ok ? await r.json() : { error: true };
  } catch {
    accessInfo = { error: true };
  }
  if (tab === "People & access") render();
}
function accessSyncResult(result) {
  if (!me.owner) return;
  if (result === "ok") toast("Sign-in list updated");
  else if (result === "not-configured") toast("Saved. The Cloudflare sign-in list still needs updating: see People & access.");
  else if (result === "failed") toast("Saved, but the Cloudflare sign-in list could not be updated. Try again from People & access.");
  accessInfo = null;
}

function peopleAccess() {
  if (!me.owner) return "";
  if (!accessInfo) loadAccessInfo();
  const members = accessMembers();
  const crew = db.staff.filter((s) => /\S+@\S+\.\S+/.test(s.email || ""));
  const cards = members
    .map((m, n) => {
      const areas = ACCESS_AREAS.map(
        ([k, label, hint]) =>
          `<label class="check-card small" title="${esc(hint)}"><input type="checkbox" ${m.sections.includes(k) ? "checked" : ""} onchange="setMemberArea(${n},'${k}',this.checked)"> ${esc(label)}</label>`,
      ).join("");
      return `<div class="panel member"><div class="line" style="border:0;padding-top:0"><div><h2 style="margin:0">${esc(m.name)}</h2><span class="muted">${esc(m.email)}</span></div>
        <div class="toolbar" style="margin:0">${ACCESS_PRESETS.map(([l, s]) => `<button class="btn small secondary" onclick="setMemberPreset(${n},${esc(JSON.stringify(s))})">${l}</button>`).join("")}</div></div>
        <div class="profile-grid">${areas}</div>
        <div class="toolbar" style="margin:0"><button class="btn small danger" onclick="removeMember(${n})">Remove access</button></div></div>`;
    })
    .join("");
  const info = accessInfo;
  const signIn = !info
    ? '<p class="muted">Checking the sign-in list…</p>'
    : info.error
      ? '<p class="hint">Could not check the sign-in list.</p>'
      : `<p>${info.emails.length} ${info.emails.length === 1 ? "person" : "people"} can request a sign-in code: <span class="muted">${info.emails.map(esc).join(", ")}</span></p>
        ${info.inSync ? '<p><span class="tag success">✓ Cloudflare sign-in list is up to date</span></p>' : `<p><span class="tag warning">Cloudflare sign-in list needs updating</span></p>${info.automatic ? `<button class="btn small" onclick="syncAccessNow()">Update sign-in list now</button>` : `<p class="hint">Automatic updates are not switched on yet, so new people can't sign in until the list is updated. Ask Claude to update it, or switch on automatic updates (see the setup notes).</p>`}`}`;
  return `<div class="panel"><h2 style="margin-top:0">Who can sign in</h2>
      <p class="hint">Only people on this list can get a sign-in code. That's you, the team members below, and crew you've added under Staff with an email address. Remove someone here or from Staff and they can no longer sign in.</p>${signIn}</div>
    <div class="line" style="border:0"><h2 style="margin:0">Team members</h2></div>
    <p class="hint">Team members use the full HQ app, but only the areas you tick. They can't change Branding, backups or this page, and only you can approve safety documents.</p>
    ${cards || '<p class="empty">No team members yet.</p>'}
    <form class="panel form" onsubmit="addMember(event)"><h2 class="wide" style="margin:0">Add a team member</h2>
      <label><span class="muted">Name</span><input class="field" name="name" required placeholder="e.g. Julian"></label>
      <label><span class="muted">Email they'll sign in with</span><input class="field" name="email" type="email" required></label>
      <label class="wide"><span class="muted">Starting access</span><select class="field" name="preset">${ACCESS_PRESETS.map(([l], i) => `<option value="${i}">${l}</option>`).join("")}</select><span class="hint">You can fine-tune the areas after adding them.</span></label>
      <div class="wide"><button class="btn" type="submit">Add team member</button></div></form>
    <div class="panel"><h2 style="margin-top:0">Crew</h2><p class="hint">Crew see only their own "My jobs" page. To invite crew, add them under Staff with their email address.</p>
    ${crew.length ? crew.map((s) => row(esc(s.name), `<span class="muted">${esc(s.email)}</span>`)).join("") : '<p class="empty">No crew with an email address yet.</p>'}
    <div class="toolbar"><button class="btn small secondary" onclick="go('Staff')">Open Staff</button></div></div>`;
}
function addMember(e) {
  e.preventDefault();
  const d = data(e),
    email = d.email.trim().toLowerCase();
  const members = accessMembers();
  if (members.some((m) => m.email === email)) return alert(email + " is already a team member.");
  if (email === String(me.email || "").toLowerCase()) return alert("That's your own email: you already have full access.");
  members.push({ name: d.name.trim(), email, sections: [...ACCESS_PRESETS[Number(d.preset) || 0][1]], addedAt: new Date().toISOString() });
  save();
  render();
}
function setMemberArea(n, key, on) {
  const m = accessMembers()[n];
  m.sections = on ? [...new Set([...m.sections, key])] : m.sections.filter((s) => s !== key);
  save();
  render();
}
function setMemberPreset(n, sections) {
  accessMembers()[n].sections = [...sections];
  save();
  render();
}
function removeMember(n) {
  const m = accessMembers()[n];
  if (!confirm("Remove " + m.name + "'s access to HD Events HQ? They will no longer be able to sign in.")) return;
  accessMembers().splice(n, 1);
  save();
  render();
}
async function syncAccessNow() {
  const r = await fetch("/api/access/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (r.ok) accessSyncResult((await r.json()).access);
  accessInfo = null;
  render();
}
