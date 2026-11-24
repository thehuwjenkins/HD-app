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
  const owner = me.owner,
    canMoney = me.money;
  if (st === "quote" && j.acceptedAt)
    return b("Client accepted: book it", `acceptJob(${j.id})`) + `<span class="hint" style="margin:0">${esc(j.needsBooking || "")}</span>`;
  return (
    {
      enquiry: (canMoney ? b("Send quote", `sendToClient(${j.id},'quote')`) : "") + b("Mark quote as sent", `moveTo(${j.id},'quote')`, canMoney ? "secondary" : ""),
      quote: b("Mark as accepted", `acceptJob(${j.id})`) + (canMoney ? b("Resend quote", `sendToClient(${j.id},'quote')`, "secondary") : ""),
      booked: b("Print picking list", `printJob(${j.id})`) + (owner ? b("Send invoice", `sendToClient(${j.id},'invoice')`, "secondary") : "") + b("Mark as hired out", `moveTo(${j.id},'out')`, "secondary"),
      out: b("Mark as returned", `moveTo(${j.id},'returned')`) + b("Picking list", `printJob(${j.id})`, "secondary"),
      returned: (owner ? b("Send invoice", `sendToClient(${j.id},'invoice')`) : "") + b("Mark as invoiced", `moveTo(${j.id},'invoiced')`, owner ? "secondary" : ""),
      invoiced: "",
    }[st] || ""
  );
}
// Accepting (by Huw, or the client online) books the job, creates the invoice and readies the picking list.
function acceptJob(id) {
  const j = db.jobs.find((x) => x.id === id);
  if (!j) return;
  if (!moveTo(id, "booked")) return; // stock or dates need sorting first (moveTo explains)
  j.acceptedAt ||= new Date().toISOString();
  j.acceptedBy ||= "Marked by " + (me.email || "HD Events");
  j.acceptedVia ||= "manual";
  delete j.needsBooking;
  if (!j.invoiceNo) {
    j.invoiceNo = nextInvoiceNo(db.jobs);
    j.invoiceDate = todayKey();
  }
  save();
  render();
  toast(`<b>${esc(j.title)}</b> booked. Invoice ${esc(j.invoiceNo)} created and the picking list is ready.`);
}
function clientLink(j) {
  return location.origin + "/q/" + j.quoteToken;
}
function ensureQuoteLink(j) {
  if (!j.quoteToken) {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    j.quoteToken = [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
    save();
  }
  return clientLink(j);
}
// The "email the client" window: To, subject and message filled in, with the client's link.
function sendToClient(id, kind) {
  const j = db.jobs.find((x) => x.id === id);
  if (!j) return;
  if (kind === "invoice" && !j.invoiceNo) {
    j.invoiceNo = nextInvoiceNo(db.jobs);
    j.invoiceDate = todayKey();
    save();
  }
  const link = ensureQuoteLink(j);
  const c = db.clients.find((x) => String(x.id) === String(j.clientId)) || {};
  const co = db.company?.name || "HD Events";
  const total = money(quoteSummary(j, { vatRegistered: !!db.company?.vatNumber }).gross);
  const subject = kind === "quote" ? `Quotation: ${j.title}` : `Invoice ${j.invoiceNo}: ${j.title}`;
  const body =
    kind === "quote"
      ? `Hello${c.name ? " " + c.name.split(" ")[0] : ""},\n\nThank you for your enquiry. Your quotation for ${j.title}${j.start ? " (" + fmtRange(j) + ")" : ""} is ready: ${total}.\n\nYou can view it, save it as a PDF and accept it online here:\n${link}\n\nAny questions, just reply to this email.\n\nKind regards,\n${co}`
      : `Hello${c.name ? " " + c.name.split(" ")[0] : ""},\n\nThank you for booking with us. Your invoice ${j.invoiceNo} for ${j.title} (${total}) is here, with payment details:\n${link}\n\nPlease use ${j.invoiceNo} as the payment reference.\n\nKind regards,\n${co}`;
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "sendDialog";
  root.innerHTML = `<div class="panel send-dialog"><div class="line"><h2 style="margin:0">${kind === "quote" ? "Send quote" : "Send invoice"} · ${esc(j.title)}</h2><button class="btn small ghost" onclick="$('sendDialog').remove()">Close</button></div>
    ${c.email ? "" : `<p class="load-warn">This client has no email address yet. Type it below, or add it under CRM.</p>`}
    <div class="form" style="margin-top:12px">
      <label class="wide"><span class="muted">To</span><input class="field" id="sendTo" type="email" value="${esc(c.email || "")}" placeholder="client@example.com"></label>
      <label class="wide"><span class="muted">Subject</span><input class="field" id="sendSubject" value="${esc(subject)}"></label>
      <label class="wide"><span class="muted">Message</span><textarea class="field" id="sendBody" rows="11">${esc(body)}</textarea></label>
    </div>
    <p class="hint">The link opens a page with the ${kind === "quote" ? "quote, which the client can save as a PDF and accept online. When they accept, the job is booked, the invoice is created and the picking list is ready, automatically." : "invoice and your bank details. The client can save it as a PDF."}</p>
    <div class="toolbar">
      <button class="btn" onclick="sendVia('gmail',${id},'${kind}')">Open in Gmail</button>
      <button class="btn secondary" onclick="sendVia('mailto',${id},'${kind}')">Open in email app</button>
      <button class="btn secondary" onclick="copySend()">Copy message</button>
      <a class="btn secondary" href="${esc(link)}" target="_blank" rel="noopener">Preview client page</a>
      <button class="btn ghost" onclick="${kind === "quote" ? "printQuote" : "printInvoice"}(${id})">Print / PDF</button>
    </div></div>`;
  document.body.appendChild(root);
}
function sendVia(how, id, kind) {
  const to = $("sendTo").value.trim(),
    su = $("sendSubject").value,
    body = $("sendBody").value;
  const url =
    how === "gmail"
      ? "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(to) + "&su=" + encodeURIComponent(su) + "&body=" + encodeURIComponent(body)
      : "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent(su) + "&body=" + encodeURIComponent(body);
  if (how === "gmail") window.open(url, "_blank", "noopener");
  else location.href = url;
  // Save the email address on the client if it was typed here.
  const j = db.jobs.find((x) => x.id === id);
  const c = db.clients.find((x) => String(x.id) === String(j.clientId));
  if (c && to && !c.email) c.email = to;
  if (kind === "quote" && !j.acceptedAt) {
    j.quoteSentAt = new Date().toISOString(); // the quote is valid for 30 days from sending
    if (stageOf(j) === "enquiry") moveTo(id, "quote");
  }
  if (kind === "invoice") j.invoiceSentAt = new Date().toISOString();
  save();
  render();
  $("sendDialog")?.remove();
  toast(kind === "quote" ? "Quote ready to send in your email. Marked as Quote sent." : "Invoice ready to send in your email.");
}
async function copySend() {
  const text = "To: " + $("sendTo").value + "\nSubject: " + $("sendSubject").value + "\n\n" + $("sendBody").value;
  try {
    await navigator.clipboard.writeText(text);
    toast("Message copied");
  } catch {
    $("sendBody").select();
  }
}
