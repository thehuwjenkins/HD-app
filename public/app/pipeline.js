// Pipeline: one column per stage. Move a job forward or back with the arrow buttons.
function pipeline() {
  const today = todayKey();
  const cols = STAGES.map((st, i) => {
    const list = db.jobs
      .filter((j) => stageOf(j) === st)
      .sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999"));
    const total = list.reduce((s, j) => s + jobValue(j), 0);
    const cards = list
      .map((j) => {
        const issues = st === "invoiced" || st === "returned" ? [] : jobShortages(j);
        const late = st === "booked" && (jobDays(j)?.[0] || "9") < today;
        return `<div class="board-card"><b>${esc(j.title)}</b><span class="muted">${esc(j.client || "No client")}</span><span class="muted">${esc(fmtRange(j))}</span><span class="muted">${money(jobValue(j))}</span>${issues.length ? `<span class="tag warning">${issues.length} shortage(s)</span>` : ""}${late ? '<span class="tag warning">Start date passed</span>' : ""}
        <div class="moves"><button class="btn small ghost" ${i === 0 ? "disabled" : ""} onclick="moveStage(${j.id},-1)" aria-label="Move ${esc(j.title)} back to ${i ? STAGE_LABELS[STAGES[i - 1]] : ""}">←</button><button class="btn small secondary" onclick="openJob(${j.id})">Open</button><button class="btn small ghost" ${i === STAGES.length - 1 ? "disabled" : ""} onclick="moveStage(${j.id},1)" aria-label="Move ${esc(j.title)} on to ${STAGE_LABELS[STAGES[i + 1]] || ""}">→</button></div></div>`;
      })
      .join("");
    return `<section class="board-col" data-stage="${st}"><h2>${STAGE_LABELS[st]} <small>${list.length} · ${money(total)}</small></h2>${cards || '<p class="hint">None</p>'}</section>`;
  });
  return `<div class="toolbar">${canWrite("jobs") ? `<button class="btn" onclick="newJob()">+ New job</button>` : ""}<span class="hint">Booked and Out on hire reserve stock. Moving a job to Booked checks for shortages first.</span></div><div class="board">${cols.join("")}</div>`;
}

// Move a job one stage forward (+1) or back (-1), keeping its stock reservation in step.
function moveStage(id, dir) {
  const j = db.jobs.find((x) => x.id === id);
  if (!j) return;
  moveTo(id, STAGES[STAGES.indexOf(stageOf(j)) + dir]);
}
// When each step happened, recorded on the job.
const STAGE_STAMP = { quote: "quoteSentAt", booked: "acceptedAt", out: "hiredOutAt", returned: "returnedAt", invoiced: "invoicedAt" };
function moveTo(id, to) {
  const j = db.jobs.find((x) => x.id === id);
  if (!j || !to || to === stageOf(j)) return false;
  const next = { ...j, stage: to, booking: STAGE_BOOKING[to] };
  if (STAGE_STAMP[to] && STAGES.indexOf(to) > STAGES.indexOf(stageOf(j))) next[STAGE_STAMP[to]] = new Date().toISOString();
  if (next.booking === "Reserved" && j.booking !== "Reserved") {
    const [from, until] = bounds(next);
    if (!(until > from)) return alert("Set the job's allocation start and return date before booking it.");
    if (!next.kit.length) return alert("Add equipment to the job before booking it.");
    const issue = shortages(next, db)[0];
    if (issue) {
      alert(`Can't book ${j.title}: ${issue.name} is short by ${issue.short}${issue.conflicts.length ? " (also out on " + issue.conflicts.join(", ") + ")" : ""}. Plan a cross-hire or change the kit first.`);
      return false;
    }
  }
  Object.assign(j, next);
  save();
  render();
  return true;
}
// ---------- Next action on each job ----------
function nextActions(j) {
  const st = stageOf(j);
  const b = (label, fn, cls = "") => `<button class="btn small ${cls}" onclick="${fn}">${label}</button>`;
  const money = me.money,
    owner = me.owner;
  return (
    {
      enquiry: (money ? b("Send quote", `sendQuote(${j.id})`) : "") + b("Mark quote as sent", `moveTo(${j.id},'quote')`, money ? "secondary" : ""),
      quote: b("Mark as accepted", `moveTo(${j.id},'booked')`),
      booked: b("Mark as hired out", `moveTo(${j.id},'out')`) + (owner ? b("Send invoice", `sendInvoice(${j.id})`, "secondary") : ""),
      out: b("Mark as returned", `moveTo(${j.id},'returned')`),
      returned: (owner ? b("Send invoice", `sendInvoice(${j.id})`) : "") + b("Mark as invoiced", `moveTo(${j.id},'invoiced')`, owner ? "secondary" : ""),
      invoiced: "",
    }[st] || ""
  );
}
// Email draft to the client with the document open alongside it to save as PDF and attach.
function clientEmailDraft(j, subject, body) {
  const c = db.clients.find((x) => String(x.id) === String(j.clientId)) || {};
  const a = document.createElement("a");
  a.href = "mailto:" + encodeURIComponent(c.email || "") + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  a.click();
  return !!c.email;
}
function sendQuote(id) {
  const j = db.jobs.find((x) => x.id === id);
  printQuote(id);
  const hasEmail = clientEmailDraft(j, "Quotation: " + j.title, `Hello,\n\nPlease find attached our quotation for ${j.title}${j.start ? " (" + fmtRange(j) + ")" : ""}.\n\nAny questions, just reply to this email.\n\nKind regards,\n${db.company?.name || "HD Events"}`);
  setTimeout(() => {
    if (confirm(`The quote has opened in a new tab: save it as a PDF and attach it to the email${hasEmail ? "" : " (no email address on this client yet)"}.\n\nMark the quote as sent now?`)) moveTo(id, "quote");
  }, 400);
}
function sendInvoice(id) {
  const j = db.jobs.find((x) => x.id === id);
  printInvoice(id);
  if (!j.invoiceNo) return; // invoice not created
  const hasEmail = clientEmailDraft(j, "Invoice " + j.invoiceNo + ": " + j.title, `Hello,\n\nPlease find attached invoice ${j.invoiceNo} for ${j.title}.\n\nThank you for your business.\n\nKind regards,\n${db.company?.name || "HD Events"}`);
  if (stageOf(j) === "returned")
    setTimeout(() => {
      if (confirm(`The invoice has opened in a new tab: save it as a PDF and attach it to the email${hasEmail ? "" : " (no email address on this client yet)"}.\n\nMark the job as invoiced now?`)) moveTo(id, "invoiced");
    }, 400);
}
