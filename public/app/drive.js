// Google Drive: connect once (Branding), then "Save to Drive" on an event plan or a job puts its
// documents into that event's folder: HD Events HQ › year › event name › sub-folders.
let driveInfo = null, driveLoading = false;
const driveFolders = {}; // "plan:123" -> folder link ("" = none yet)
async function loadDrive(ref = "") {
  try {
    const r = await fetch("/api/google/status" + (ref ? "?ref=" + encodeURIComponent(ref) : ""));
    const d = r.ok ? await r.json() : { error: true };
    if (ref) driveFolders[ref] = d.folderLink || "";
    delete d.folderLink;
    driveInfo = d;
  } catch {
    driveInfo = { error: true };
  }
  return driveInfo;
}
// Load the connection status once; redraw when it arrives.
function driveReady() {
  if (driveInfo) return true;
  if (!driveLoading) {
    driveLoading = true;
    loadDrive().then(() => {
      driveLoading = false;
      render();
    });
  }
  return false;
}
// Result of coming back from Google's sign-in page.
(() => {
  const q = new URLSearchParams(location.search).get("google");
  if (!q) return;
  history.replaceState(null, "", location.pathname + location.hash);
  const msg = { connected: "Google Drive connected", cancelled: "Google Drive was not connected (cancelled)", expired: "That took too long. Press Connect Google Drive again.", "no-refresh": "Google didn't give a lasting connection. Press Connect Google Drive again." }[q];
  setTimeout(() => msg && (q === "connected" ? toast(msg) : alert(msg)), 600);
})();

// ---------- Branding panel (owner) ----------
function drivePanel() {
  if (!me.owner) return "";
  if (!driveReady()) return panel("Google Drive", '<p class="muted">Checking the Google Drive connection…</p>');
  const d = driveInfo;
  const body = d.error
    ? '<p class="hint">Could not check the Google Drive connection.</p>'
    : !d.configured
      ? '<p class="hint">Google isn\'t set up on the server yet (it needs the Google client ID and secret).</p>'
      : d.connected
        ? `<p><span class="tag success">Connected</span> ${d.account ? "as <b>" + esc(d.account) + "</b>" : ""}${d.connectedAt ? ' <span class="muted">since ' + esc(hqWhen(d.connectedAt)) + "</span>" : ""}</p>
           <p class="hint">Each event gets a folder in <b>My Drive › HD Events HQ › year › event</b>. Use <b>Save to Drive</b> on an event plan or a job. The app can only see files it created, not the rest of your Drive.</p>
           <div class="toolbar">${d.rootLink ? `<a class="btn small secondary" href="${esc(d.rootLink)}" target="_blank" rel="noopener">Open HD Events HQ folder</a>` : ""}<button class="btn small danger" onclick="disconnectDrive()">Disconnect</button></div>`
        : `<p class="hint">Connect your Google Drive so each event gets its own folder with its safety documents (as Google Docs), checklist and suppliers (as Google Sheets), certificates, posters and job paperwork. The app can only see files it creates.</p>
           <a class="btn" href="/api/google/connect">Connect Google Drive</a>`;
  return panel("Google Drive", body);
}
async function disconnectDrive() {
  if (!confirm("Disconnect Google Drive?\n\nFiles already in your Drive stay there. Saving to Drive stops until you connect again.")) return;
  const r = await fetch("/api/google/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) return alert("Could not disconnect: " + (await r.text()));
  driveInfo = null;
  render();
}

// ---------- Building the files ----------
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
const stripPrintButton = (html) => html.replace(/<div class="actions">[\s\S]*?<\/div>/, "").replace(/<button[^>]*>[\s\S]*?<\/button>/g, "").replace(/<div class="wm">DRAFT<\/div>/, "");
async function logoData() {
  try {
    const src = db.branding?.docLogo || DOC_LOGO;
    const blob = await (await fetch(src)).blob();
    return await new Promise((ok) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
// The job's quote, invoice (once it has a number) and picking list, as print-ready pages.
async function jobPaperwork(j) {
  printCapture = { logo: await logoData() };
  const out = [];
  try {
    const pick = printJob(j.id);
    if (pick) out.push({ sub: "Job paperwork", name: "Picking list · " + j.title, as: "doc", html: stripPrintButton(pick) });
    if (me.money && (j.kit || []).length) {
      const q = printQuote(j.id);
      if (q) out.push({ sub: "Job paperwork", name: "Quotation · " + j.title, as: "doc", html: stripPrintButton(q) });
    }
    if (me.owner && j.invoiceNo) {
      const inv = printInvoice(j.id);
      if (inv) out.push({ sub: "Job paperwork", name: "Invoice " + j.invoiceNo + " · " + j.title, as: "doc", html: stripPrintButton(inv) });
    }
  } finally {
    printCapture = null;
  }
  return out;
}
function planFiles(p) {
  const out = [];
  for (const { item } of planDocs(p)) {
    const ok = item.doc.status === "approved";
    out.push({ sub: "Safety documents", name: item.title + (ok ? " (approved)" : " (draft)"), as: "doc", html: stripPrintButton(docHtml(p, item)) });
  }
  const rows = [["Stage", "Item", "Status", "Owner", "Due", "Notes", "Files"]];
  for (const s of p.stages) for (const i of s.items) rows.push([s.name, i.title, { todo: "To do", doing: "In progress", done: "Done", na: "Not needed" }[i.status] || i.status, i.owner || "", i.due || "", i.notes || "", (i.files || []).map((f) => f.name).join("; ")]);
  out.push({ sub: "Checklist & suppliers", name: "Checklist · " + p.title, as: "sheet", csv: toCsv(rows) });
  if ((p.suppliers || []).length) {
    const checks = SUPPLIER_CHECKS.map(([f, l]) => [f, l]);
    const due = p.eventDate || todayKey();
    const srows = [["Supplier", "Provides", "Contact", "kW", "Phase", ...checks.map(([, l]) => l), "Missing", "Files"]];
    for (const s of p.suppliers) srows.push([s.name, SUPPLIER_TYPES[s.type] || "Other", s.contact || "", s.kw || "", s.phase || "", ...checks.map(([f]) => (s[f] === true ? "Yes" : s[f] || "")), supplierGaps(s, due).join("; "), (s.files || []).map((f) => f.name).join("; ")]);
    out.push({ sub: "Checklist & suppliers", name: "Suppliers & power · " + p.title, as: "sheet", csv: toCsv(srows) });
  }
  if ((p.site?.features || []).length) {
    const frows = [["Feature", "Type", "Notes"]];
    for (const f of p.site.features) frows.push([f.label || "", SITE_KINDS[f.kind]?.[1] || SITE_SHAPES[f.kind]?.[2] || f.kind || "", f.notes || ""]);
    out.push({ sub: "Site map & posters", name: "Site map features · " + p.title, as: "sheet", csv: toCsv(frows) });
  }
  out.push({ sub: "Compliance pack", name: "Compliance pack · " + p.title, as: "doc", html: stripPrintButton(complianceHtml(p)) });
  const seen = new Set();
  const addFile = (sub, url, name) => {
    if (!/^\/files\//.test(url || "") || seen.has(url)) return;
    seen.add(url);
    out.push({ sub, as: "file", fileUrl: url, name: name || url.split("/").pop() });
  };
  for (const s of p.stages) for (const i of s.items) for (const f of i.files || []) addFile("Certificates & uploads", f.url, i.title + " · " + f.name);
  for (const s of p.suppliers || []) for (const f of s.files || []) addFile("Certificates & uploads", f.url, s.name + " · " + f.name);
  (p.posters || []).forEach((x, n) => x.exported && addFile("Site map & posters", x.exported, (x.title || "Poster " + (n + 1)) + ".png"));
  return out;
}

// ---------- Saving ----------
let driveBusy = false;
async function sendToDrive(ref, title, year, files) {
  if (driveBusy) return;
  driveBusy = true;
  let done = 0,
    folderLink = "",
    failed = [];
  const bar = document.createElement("div");
  bar.className = "drive-progress";
  document.body.appendChild(bar);
  try {
    for (const f of files) {
      bar.textContent = `Saving to Google Drive… ${done + 1} of ${files.length}: ${f.name}`;
      const r = await fetch("/api/google/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref, title, year, ...f }) });
      if (r.status === 409) throw Error(await r.text());
      if (!r.ok) failed.push(f.name + ": " + (await r.text()).slice(0, 120));
      else folderLink = (await r.json()).folderLink || folderLink;
      done++;
    }
  } catch (e) {
    alert(e.message);
    return;
  } finally {
    bar.remove();
    driveBusy = false;
  }
  if (folderLink) driveFolders[ref] = folderLink;
  render();
  if (failed.length) alert(`Saved ${files.length - failed.length} of ${files.length} to Google Drive. These didn't save:\n\n` + failed.join("\n"));
  else toast(`Saved ${files.length} file${files.length === 1 ? "" : "s"} to Google Drive`);
  if (folderLink && confirm("Saved. Open the event's Drive folder?")) window.open(folderLink, "_blank", "noopener");
}
async function savePlanToDrive(planId) {
  const p = db.plans.find((x) => x.id === planId);
  if (!p) return;
  const job = planJob(p);
  const files = [...planFiles(p), ...(job && canSee("Jobs") ? await jobPaperwork(job) : [])];
  await sendToDrive("plan:" + p.id, p.title, (p.eventDate || todayKey()).slice(0, 4), files);
}
async function saveJobToDrive(jobId) {
  const j = db.jobs.find((x) => x.id === jobId);
  if (!j) return;
  const plan = db.plans.find((x) => x.jobId === j.id);
  if (plan && canSee("Event Planner")) return savePlanToDrive(plan.id);
  await sendToDrive("job:" + j.id, j.title, String(j.start || todayKey()).slice(0, 4), await jobPaperwork(j));
}
// Buttons for a plan or job: Save to Drive, and Open folder once it has one.
function driveButtons(ref, saveCall, withFolder = false) {
  if (!driveReady() || !driveInfo.connected) return "";
  if (withFolder && !(ref in driveFolders)) {
    driveFolders[ref] = "";
    loadDrive(ref).then(() => driveFolders[ref] && render());
  }
  const link = withFolder && driveFolders[ref];
  return `<button class="btn small secondary" onclick="${saveCall}">Save to Drive</button>${link ? `<a class="btn small ghost" href="${esc(link)}" target="_blank" rel="noopener">Open Drive folder</a>` : ""}`;
}
