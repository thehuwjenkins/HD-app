// Crew reports on a job: damage, debriefs, receipts and venue photos (sent from the crew "My jobs" page).
const jobReportsFor = (id) => db.jobReports.filter((r) => String(r.jobId) === String(id)).sort((a, b) => (a.at || "").localeCompare(b.at || ""));
function reportsBadge(j) {
  const list = jobReportsFor(j.id);
  if (!list.length) return "";
  const damage = list.filter((r) => r.kind === "damage").length;
  return `<button class="btn small ${damage ? "warn-btn" : "secondary"}" onclick="openJobReports(${j.id})">Crew reports (${list.length})${damage ? ` · ${damage} damage` : ""}</button>`;
}
function openJobReports(id) {
  const j = db.jobs.find((x) => x.id === id);
  const list = jobReportsFor(id);
  const when = (r) => `${esc(r.byName || r.by)} · ${new Date(r.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
  const del = (r) => (canWrite("jobReports") ? `<button class="btn small ghost" onclick="deleteJobReport(${r.id},${id})">Delete</button>` : "");
  const damage = list.filter((r) => r.kind === "damage");
  const debriefs = list.filter((r) => r.kind === "debrief");
  const photos = list.filter((r) => r.kind === "photo");
  const section = (title, items, body) => `<h3>${title} (${items.length})</h3>${items.length ? body : '<p class="hint">None yet.</p>'}`;
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "reportsDialog";
  root.innerHTML = `<div class="panel reports-dialog"><div class="line"><h2 style="margin:0">Crew reports · ${esc(j?.title || "")}</h2><button class="btn small ghost" onclick="$('reportsDialog').remove()">Close</button></div>
    ${section("Damage", damage, damage.map((r) => `<div class="report damage"><b>${esc(r.item)}</b><p>${esc(r.text)}</p><div class="line" style="border:0;padding:0"><span class="muted">${when(r)}</span>${del(r)}</div></div>`).join(""))}
    ${section("Debriefs", debriefs, debriefs.map((r) => `<div class="report"><p>${esc(r.text)}</p><div class="line" style="border:0;padding:0"><span class="muted">${when(r)}</span>${del(r)}</div></div>`).join(""))}
    ${section("Receipts and venue photos", photos, `<div class="report-photos">${photos.map((r) => `<figure><a href="${esc(r.url)}" target="_blank" rel="noopener"><img src="${esc(r.url)}" alt="${esc(r.label)}" loading="lazy"></a><figcaption><span class="tag ${r.label === "Receipt" ? "cert" : "success"}">${esc(r.label)}</span> ${r.text ? esc(r.text) : ""}<br><span class="muted">${when(r)}</span> <a href="${esc(r.url)}" download="${esc((r.label || "photo") + " - " + (j?.title || "") + " - " + (r.name || "photo"))}">Download</a> ${del(r)}</figcaption></figure>`).join("")}</div>`)}</div>`;
  document.body.appendChild(root);
}
function deleteJobReport(rid, jobId) {
  if (!confirm("Delete this crew report? The photo file stays in storage but is no longer linked to the job.")) return;
  db.jobReports = db.jobReports.filter((r) => r.id !== rid);
  save();
  $("reportsDialog")?.remove();
  render();
  openJobReports(jobId);
}
