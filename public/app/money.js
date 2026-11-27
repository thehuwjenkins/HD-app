// Payments on a job: card payments arrive from Stripe by themselves; bank transfers, cash and refunds are
// recorded here. The status (Payment due, Deposit due, Part paid, Paid, Overpaid) comes from paymentStatus
// in stock.js, the same code the client's invoice page uses.
const payOpts = () => ({ vatRegistered: !!db.company?.vatNumber, company: db.company || {} });
const payStatus = (j) => paymentStatus(j, payOpts());
const PAY_TAG = { "Payment due": "warning", "Deposit due": "warning", "Part paid": "", Paid: "success", Overpaid: "danger-tag", "No charge": "" };
const PAY_METHODS = [["bank", "Bank transfer"], ["card", "Card (taken elsewhere)"], ["cash", "Cash"], ["other", "Other"]];

function paymentTag(j) {
  if (!me.money || !j.invoiceNo) return "";
  const ps = payStatus(j);
  const extra = ps.status === "Deposit due" ? " " + money(ps.depositOwed) : ps.status === "Part paid" || ps.status === "Payment due" ? " " + money(ps.due) : ps.status === "Overpaid" ? " by " + money(ps.overpaid) : "";
  return `<span class="tag ${PAY_TAG[ps.status] ?? ""}" title="${esc(j.invoiceNo)}">${esc(j.invoiceNo)} · ${esc(ps.status)}${extra}</span>`;
}
function openPayments(id) {
  const j = db.jobs.find((x) => x.id === id);
  if (!j) return;
  $("paymentsDialog")?.remove();
  const ps = payStatus(j);
  const today = todayKey();
  const methodName = (m) => (PAY_METHODS.find(([v]) => v === m) || [, m === "card" ? "Card" : "Other"])[1].replace(" (taken elsewhere)", "");
  const rows = (j.payments || [])
    .map((p, i) => `<tr><td>${esc(fmtDay(String(p.at).slice(0, 10), { day: "numeric", month: "short", year: "numeric" }))}</td><td>${p.kind === "refund" ? "Refund" : p.kind === "deposit" ? "Deposit" : "Payment"}</td><td>${esc(methodName(p.method))}${p.ref && p.method !== "card" ? " · " + esc(p.ref) : p.method === "card" && p.ref ? ' · <span class="muted">Stripe</span>' : ""}</td><td class="num">${p.kind === "refund" ? "−" : ""}${money(p.amount)}${p.fee ? `<div class="muted">+ ${money(p.fee)} card fee</div>` : ""}</td><td>${canWrite("jobs") ? `<button class="btn small ghost" onclick="removePayment(${id},${i})">Remove</button>` : ""}</td></tr>`)
    .join("");
  const suggested = ps.depositOwed > 0 ? ps.depositOwed : ps.due;
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "paymentsDialog";
  root.innerHTML = `<div class="panel reports-dialog"><div class="line"><h2 style="margin:0">Payments · ${esc(j.title)}</h2><button class="btn small ghost" onclick="$('paymentsDialog').remove()">Close</button></div>
    <div class="pay-summary"><div><span class="muted">Invoice total</span><b>${money(ps.total)}</b></div><div><span class="muted">Paid</span><b>${money(ps.paid)}</b></div><div><span class="muted">${ps.overpaid ? "Overpaid" : "Still due"}</span><b>${money(ps.overpaid || ps.due)}</b></div><div><span class="muted">Status</span><b><span class="tag ${PAY_TAG[ps.status] ?? ""}">${esc(ps.status)}</span></b></div></div>
    ${ps.deposit ? `<p class="hint">Deposit ${money(ps.deposit)} (${Number(j.depositPct)}%)${ps.depositOwed ? `, ${money(ps.depositOwed)} still owed` : ", paid"}.${ps.balanceDate ? ` Balance due by ${esc(fmtDay(ps.balanceDate, { day: "numeric", month: "short", year: "numeric" }))}.` : ""}</p>` : ps.balanceDate && !ps.fully ? `<p class="hint">Balance due by ${esc(fmtDay(ps.balanceDate, { day: "numeric", month: "short", year: "numeric" }))}.</p>` : ""}
    ${rows ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Type</th><th>How</th><th class="num">Amount</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">No payments recorded yet.</p>'}
    ${j.paidAt && !(j.payments || []).length ? '<p class="hint">Marked as paid before payments were recorded.</p>' : ""}
    ${canWrite("jobs") ? `<h3>Record a payment</h3><form class="form" onsubmit="recordPayment(event,${id})">
      <label><span class="muted">Type</span><select class="field" name="kind"><option value="payment">Payment</option><option value="deposit" ${ps.depositOwed > 0 ? "selected" : ""}>Deposit</option><option value="refund">Refund to client</option></select></label>
      <label><span class="muted">Amount (£)</span><input class="field" name="amount" type="number" min="0.01" step="0.01" required value="${suggested > 0 ? suggested.toFixed(2) : ""}"></label>
      <label><span class="muted">Date received</span><input class="field" name="date" type="date" required value="${today}" max="${today}"></label>
      <label><span class="muted">How</span><select class="field" name="method">${PAY_METHODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
      <label class="wide"><span class="muted">Reference (optional)</span><input class="field" name="ref" maxlength="80" placeholder="e.g. bank reference"></label>
      <div class="wide toolbar"><button class="btn" type="submit">Record</button>${ps.due > 0 ? `<button class="btn secondary" type="button" onclick="this.form.amount.value='${ps.due.toFixed(2)}';this.form.kind.value='payment'">Fill in full balance (${money(ps.due)})</button>` : ""}</div></form>` : ""}
    ${j.quoteToken && j.invoiceNo ? `<p class="hint">Card payments made on the <a href="${esc(clientLink(j))}" target="_blank" rel="noopener">client's invoice page</a> appear here by themselves.</p>` : ""}</div>`;
  document.body.appendChild(root);
}
function recordPayment(e, id) {
  e.preventDefault();
  const j = db.jobs.find((x) => x.id === id);
  const d = data(e);
  const amount = Math.round(Number(d.amount) * 100) / 100;
  if (!(amount > 0)) return alert("Enter an amount.");
  const entry = { at: d.date + "T12:00:00.000Z", amount, method: d.method, kind: d.kind, ...(d.ref.trim() ? { ref: d.ref.trim() } : {}) };
  const before = payStatus(j);
  if (entry.kind !== "refund" && amount > before.due + 0.005 && !confirm(`That's more than the ${money(before.due)} still due, so the job will show as overpaid. Record it anyway?`)) return;
  Object.assign(j, withPayments(j, [...(j.payments || []), entry], payOpts()));
  if (j.paidAt && stageOf(j) === "returned") moveTo(id, "invoiced");
  save();
  render();
  openPayments(id);
  toast(`${entry.kind === "refund" ? "Refund" : "Payment"} of ${money(amount)} recorded`);
}
function removePayment(id, i) {
  const j = db.jobs.find((x) => x.id === id);
  const p = (j.payments || [])[i];
  if (!p || !confirm(`Remove the ${money(p.amount)} ${p.kind === "refund" ? "refund" : "payment"} from ${fmtDay(String(p.at).slice(0, 10), { day: "numeric", month: "short" })}?${p.method === "card" ? "\n\nThis was a card payment through Stripe. Removing it here doesn't refund the card: do that in Stripe." : ""}`)) return;
  Object.assign(j, withPayments(j, j.payments.filter((_, n) => n !== i), payOpts()));
  if (!j.payments) delete j.payments;
  save();
  render();
  openPayments(id);
}
