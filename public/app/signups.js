// Sign-ups: people who registered interest on a public page (Aberavon Beach Fest).
// Not part of the workspace data: loaded from the server when this page opens.
const SIGNUP_INTERESTS = { music: "Live music", kids: "Kids Fest", market: "Steel Town Market", holistic: "Holistic mornings", trader: "Trader / stall", perform: "Performing", volunteer: "Volunteering", sponsor: "Sponsorship" };
let signupData = null,
  signupQuery = "",
  signupFilter = "";
async function loadSignups() {
  try {
    const r = await fetch("/api/signups?list=beachfest");
    signupData = r.ok ? await r.json() : { error: await r.text() };
  } catch (e) {
    signupData = { error: e.message };
  }
  if (tab === "Sign-ups") render();
}
function signupRows() {
  const q = signupQuery.toLowerCase();
  return (signupData?.signups || []).filter((s) => (!signupFilter || (s.interests || []).includes(signupFilter)) && (!q || [s.name, s.email, s.town, s.business, s.message].join(" ").toLowerCase().includes(q)));
}
function signupsPage() {
  if (!signupData) {
    loadSignups();
    return panel("Aberavon Beach Fest sign-ups", '<p class="muted">Loading…</p>');
  }
  if (signupData.error) return panel("Sign-ups", `<p class="hint">Could not load sign-ups: ${esc(signupData.error)}</p><button class="btn small" onclick="signupData=null;render()">Try again</button>`);
  const all = signupData.signups,
    rows = signupRows();
  const counts = Object.fromEntries(Object.keys(SIGNUP_INTERESTS).map((k) => [k, all.filter((s) => (s.interests || []).includes(k)).length]));
  const week = all.filter((s) => Date.now() - Date.parse(s.createdAt) < 7 * 86400000).length;
  return `<div class="panel"><div class="line" style="border:0;padding-top:0"><div><h2 style="margin:0">Aberavon Beach Fest sign-ups</h2><span class="muted">From the register-interest page. Everyone here ticked the box agreeing to festival emails.</span></div>
    <div class="toolbar" style="margin:0"><a class="btn small secondary" href="https://beachfest.hd-events.co.uk" target="_blank" rel="noopener">Open the page</a><button class="btn small secondary" onclick="signupData=null;render()">Refresh</button><button class="btn small" onclick="exportSignups()" ${rows.length ? "" : "disabled"}>Export spreadsheet</button></div></div>
    <div class="stats" style="margin-top:14px"><div class="stat"><span class="label">Registered</span><span class="value">${all.length}</span><span class="sub">${week} this week</span></div>${Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `<div class="stat"><span class="label">${SIGNUP_INTERESTS[k]}</span><span class="value">${n}</span></div>`).join("")}</div>
    <div class="toolbar"><input class="field" style="flex:1;min-width:200px" placeholder="Search name, email, town, business…" value="${esc(signupQuery)}" oninput="signupQuery=this.value;$('signupList').innerHTML=signupList()"><select class="field" style="max-width:230px" onchange="signupFilter=this.value;$('signupList').innerHTML=signupList()"><option value="">Everyone</option>${Object.entries(SIGNUP_INTERESTS).map(([k, l]) => `<option value="${k}" ${k === signupFilter ? "selected" : ""}>${l} (${counts[k]})</option>`).join("")}</select></div>
    <div id="signupList">${signupList()}</div></div>`;
}
function signupList() {
  const rows = signupRows();
  if (!rows.length) return `<p class="empty">${signupData.signups.length ? "No one matches." : "No sign-ups yet. Share the page link to start collecting them."}</p>`;
  return rows
    .map((s) => row(`<b>${esc(s.name)}</b> <span class="muted">${esc(s.email)}${s.phone ? " · " + esc(s.phone) : ""}${s.town ? " · " + esc(s.town) : ""}</span><div>${(s.interests || []).map((k) => `<span class="tag">${esc(SIGNUP_INTERESTS[k] || k)}</span>`).join(" ")}${s.business ? ` <span class="muted">${esc(s.business)}</span>` : ""}</div>${s.message ? `<div class="muted">“${esc(s.message)}”</div>` : ""}`, `<span class="muted">${esc(hqWhen(s.createdAt))}</span>${me.owner ? ` <button class="btn small ghost" onclick="deleteSignup(${s.id})">Remove</button>` : ""}`))
    .join("");
}
function exportSignups() {
  const rows = signupRows();
  const cell = (v) => (/[",\n]/.test(String(v ?? "")) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? ""));
  const csv = [["Name", "Email", "Phone", "Town", "Interests", "Business", "Message", "Signed up", "Consent"], ...rows.map((s) => [s.name, s.email, s.phone, s.town, (s.interests || []).map((k) => SIGNUP_INTERESTS[k] || k).join("; "), s.business, s.message, s.createdAt, s.consent?.text || ""])].map((r) => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  a.download = "beach-fest-signups-" + todayKey() + ".csv";
  a.click();
}
async function deleteSignup(id) {
  const s = signupData.signups.find((x) => x.id === id);
  if (!confirm(`Remove ${s.name} (${s.email}) from the sign-ups?\n\nDo this if they ask to be taken off the list.`)) return;
  const r = await fetch("/api/signups/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
  if (!r.ok) return alert("Not removed: " + (await r.text()));
  signupData.signups = signupData.signups.filter((x) => x.id !== id);
  render();
}
