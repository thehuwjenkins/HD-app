// Backup box (bottom right) and the History & backups panel.
function hqExport() {
  const payload = { format: "hd-events-hq-backup", version: 1, createdAt: new Date().toISOString(), storageKey: "hde_hq_v1", data: db };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "HD_Events_HQ_backup_" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Import a downloaded backup. The server checks it and writes only the records that differ,
// keeping the current versions in the history so the import can be undone.
async function hqImport(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch (e) {
    alert("Cannot read this JSON backup.");
    return;
  }
  if (payload?.format !== "hd-events-hq-backup" || payload.version !== 1 || payload.storageKey !== "hde_hq_v1" || !payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
    alert("This is not a supported HD Events HQ backup.");
    return;
  }
  const d = payload.data;
  for (const key of COLLECTIONS) d[key] ??= [];
  for (const j of d.jobs) {
    j.booking ??= "Draft";
    j.kit ??= j.item ? [{ item: j.item, qty: Number(j.qty) || 1 }] : [];
  }
  for (const i of d.inventory) {
    i.service ??= 0;
    i.category ??= guessCategory(i.name);
  }
  try {
    validate(d);
  } catch (e) {
    alert("Import failed: " + e.message);
    return;
  }
  if (pending) return alert("Wait for the current save to finish, then try again.");
  if (!confirm("This replaces all the shared workspace records with the backup.\n\nThe current records are kept in History & backups, so this can be undone. Continue?")) return;
  try {
    await hqApi("import", { state: d });
    alert("Backup imported. The page will now reload.");
    location.reload();
  } catch (e) {
    alert("Import failed: " + e.message);
  }
}

async function hqApi(path, body) {
  const res = await fetch("/api/safety/" + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const text = await res.text();
  if (!res.ok) throw Error(text.slice(0, 300) || res.statusText);
  return text ? JSON.parse(text) : null;
}
const hqWhen = (t) => (t ? new Date(t).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");
const hqSize = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.round((b || 0) / 1e3) + " KB");
const hqNames = { jobs: "jobs", inventory: "equipment", staff: "staff", clients: "contacts", tasks: "tasks", projects: "projects", packages: "packages", crewInvites: "crew invitations", crossHires: "cross-hires", quotes: "quotes", plans: "event plans", jobReports: "crew reports", settings: "settings" };

async function hqBackupStatus() {
  const el = $("hqBackupStatus");
  try {
    const s = await hqApi("status");
    el.className = "chip " + (s.healthy ? "good" : "bad");
    const at = new Date(s.lastSuccess?.at || 0);
    const short = at.toDateString() === new Date().toDateString() ? at.toLocaleTimeString("en-GB", { timeStyle: "short" }) : at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    el.textContent = s.healthy ? "✓ Backed up " + short : "Backup needs attention";
    el.title = s.healthy ? "History, backups, export and import" : s.problem + (s.lastSuccess ? " Last good backup " + hqWhen(s.lastSuccess.at) + "." : "");
    return s;
  } catch (e) {
    el.className = "chip bad";
    el.textContent = "Backup status unknown";
    el.title = e.message;
  }
}

function hqSummary(sum) {
  const parts = [];
  for (const [k, v] of Object.entries(sum?.changes || {})) {
    const [a, r, c] = v.counts || [0, 0, 0];
    const names = [...(v.added || []).map((n) => "+" + n), ...(v.removed || []).map((n) => "−" + n), ...(v.changed || []).map((n) => "~" + n)].slice(0, 4).join(", ");
    parts.push((hqNames[k] || k) + ": " + [a && a + " added", r && r + " removed", c && c + " changed"].filter(Boolean).join(", ") + (names ? " (" + names + ")" : ""));
  }
  if (sum?.restoredFrom) parts.unshift("Restored from " + sum.restoredFrom.backupKey);
  if (sum?.undoTo) parts.unshift("Undid changes back to before " + hqWhen(Math.floor(sum.undoTo / 1000)));
  if (sum?.imported) parts.unshift("Imported from a backup file");
  if (sum?.before && sum?.after) parts.push("Moved to tables. Before: " + JSON.stringify(sum.before) + " After: " + JSON.stringify(sum.after));
  if (sum?.key) parts.push(sum.key + " · " + hqSize(sum.bytes));
  if (sum?.error) parts.push(sum.error);
  return parts.join("\n") || "No record changes";
}

async function hqSafetyOpen() {
  $("hqSafety")?.remove();
  const root = document.createElement("div");
  root.id = "hqSafety";
  root.innerHTML = '<div class="panel"><p class="muted">Loading history…</p></div>';
  document.body.appendChild(root);
  try {
    const [s, audit, backups] = await Promise.all([hqBackupStatus(), hqApi("audit?limit=150"), hqApi("backups")]);
    const saves = audit.filter((a) => ["save", "restore"].includes(a.action) && a.summary?.saveId);
    root.innerHTML = `<div class="panel"><div class="line"><h2 style="margin:0">History &amp; backups</h2><button class="btn secondary" onclick="hqSafetyClose()">Close</button></div>
  <h2 style="margin-top:18px">Cloud backup</h2><p class="${s && s.healthy ? "" : "danger"}">${s ? esc(s.healthy ? "Healthy. Last backup " + hqWhen(s.lastSuccess.at) + ", " + hqSize(s.lastSuccess.bytes) + ", checked after writing." : s.problem) : "Status unavailable"}</p>
  <div class="toolbar"><button class="btn" onclick="hqBackupNow(this)">Back up now</button><button class="btn secondary" onclick="hqExport()">Export all data</button><button class="btn secondary" onclick="$('hqImportFile').click()">Import backup file</button></div>
  <h2 style="margin-top:22px">Recent changes</h2><p class="hint">Every save keeps the records as they were before it (90 days). <b>Undo from here</b> puts back every record changed by that save and any later save. The undo can itself be undone.</p>
  ${saves.length ? saves.map((a) => row(`<b>${hqWhen(a.at)}</b> · ${esc(a.action)} by ${esc(a.email)}<pre>${esc(hqSummary(a.summary))}</pre>`, `<button class="btn small secondary" onclick="hqUndo(${a.summary.saveId},'${hqWhen(a.at)}')">Undo from here</button>`)).join("") : '<p class="muted">No changes recorded yet.</p>'}
  <h2 style="margin-top:22px">Daily and monthly backups</h2>
  ${backups.length ? backups.slice(0, 60).map((b) => row(`<b>${esc(b.key)}</b><div class="muted">${hqSize(b.bytes)}</div>`, `<a class="btn small secondary" href="/api/safety/download?key=${encodeURIComponent(b.key)}">Download</a> <button class="btn small secondary" data-key="${esc(b.key)}" onclick="hqRestore(this.dataset.key)">Restore</button>`)).join("") : '<p class="muted">No cloud backups stored yet.</p>'}
  <h2 style="margin-top:22px">Activity log</h2>
  ${audit.length ? audit.map((a) => row(`<b>${esc(a.action)}</b> · ${esc(a.email)}<div class="muted">${hqWhen(a.at)}</div><pre>${esc(hqSummary(a.summary))}</pre>`, "")).join("") : '<p class="muted">No activity recorded yet.</p>'}
  </div>`;
  } catch (e) {
    root.innerHTML = `<div class="panel"><p class="danger">Could not load history: ${esc(e.message)}</p><button class="btn secondary" onclick="hqSafetyClose()">Close</button></div>`;
  }
}
function hqSafetyClose() {
  $("hqSafety")?.remove();
}
async function hqBackupNow(btn) {
  btn.disabled = true;
  btn.textContent = "Backing up…";
  try {
    const r = await hqApi("backup-now", {});
    alert("Backup saved and verified: " + r.key);
  } catch (e) {
    alert("Backup failed: " + e.message);
  }
  hqSafetyOpen();
}
async function hqConfirmed(message, path, body) {
  if (pending) return alert("Wait for the current save to finish, then try again.");
  if (!confirm(message)) return;
  try {
    await hqApi(path, body);
    alert("Done. The page will now reload.");
    location.reload();
  } catch (e) {
    alert("Not restored: " + e.message);
  }
}
function hqUndo(saveId, when) {
  hqConfirmed("Undo the change made at " + when + " and every change after it?\n\nThe current records are kept, so this can be undone too.", "undo", { saveId });
}
function hqRestore(key) {
  hqConfirmed("Replace the whole workspace with the backup " + key + "?\n\nOnly records that differ are changed, and the current ones are kept in the history, so this can be undone.", "restore", { backupKey: key });
}
