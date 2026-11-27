// Branding page: card payments (Stripe and the card fee), the contract clients sign when they accept a
// quote, and the documents they get once the invoice is paid (PAT certificate, insurance, risk assessment).

// ---------- Card payments ----------
let stripeStatus = null;
function paymentsPanel() {
  if (stripeStatus === null) {
    stripeStatus = "checking";
    fetch("/api/payments/status")
      .then((r) => (r.ok ? r.json() : { stripe: false }))
      .then((d) => { stripeStatus = !!d.stripe; if (tab === "Branding") render(); })
      .catch(() => { stripeStatus = false; });
  }
  const co = db.company || {};
  const mode = co.cardFeeMode || "business";
  const pct = hasNum(co.cardFeePct) ? Number(co.cardFeePct) : 1.5,
    fixed = hasNum(co.cardFeeFixed) ? Number(co.cardFeeFixed) : 0.2;
  const ex = cardFee(1000, co, { company: "Example Ltd" });
  return panel(
    "Payments, deposits & card fees",
    `<p>${stripeStatus === true ? '<span class="tag success">Stripe connected</span> Clients see a <b>Pay by card</b> button on their invoice link (cards, Apple Pay, Google Pay). Payments are recorded on the job automatically.' : stripeStatus === "checking" ? "Checking Stripe…" : '<span class="tag warning">Stripe not connected</span> Add your Stripe secret key in Cloudflare as <code>STRIPE_SECRET_KEY</code> (Workers → hd-events-hq → Settings → Variables and secrets). Until then, invoices show bank transfer only.'}</p>
    <form class="form" onsubmit="saveCardFee(event)">
      <label><span class="muted">Default deposit % on new jobs (0 = none)</span><input class="field" name="depositPct" type="number" min="0" max="100" step="5" value="${hasNum(co.depositPct) ? Number(co.depositPct) : 0}"></label>
      <label><span class="muted">Balance due (days before the event)</span><input class="field" name="balanceDays" type="number" min="0" max="90" step="1" value="${hasNum(co.balanceDays) ? Number(co.balanceDays) : 7}"></label>
      <div class="wide"><p class="hint" style="margin-top:0">Clients can have their own deposit % (Clients → edit). The deposit and balance date show on the invoice link, and clients can pay the deposit or the full amount by card.</p></div>
      <label><span class="muted">Card processing fee</span><select class="field" name="cardFeeMode"><option value="business" ${mode === "business" ? "selected" : ""}>Add it for business clients (client has a company name)</option><option value="none" ${mode === "none" ? "selected" : ""}>Don't add a fee (we absorb it)</option></select></label>
      <label><span class="muted">Fee % (Stripe UK cards: 1.5)</span><input class="field" name="cardFeePct" type="number" min="0" max="10" step="0.01" value="${pct}"></label>
      <label><span class="muted">Fixed fee £ (Stripe: 0.20)</span><input class="field" name="cardFeeFixed" type="number" min="0" max="2" step="0.01" value="${fixed}"></label>
      <div class="wide"><p class="hint">${mode === "none" ? "No fee is added." : `Example: a business client paying a ${money(1000)} invoice by card pays ${money(1000 + ex)} (fee ${money(ex)}), so you still receive about ${money(1000)} after Stripe's charge. Private clients pay the invoice amount.`}<br><b>Why not everyone?</b> UK law bans adding a card fee for consumers, and for most cards that businesses use too. It's only allowed on genuine corporate/commercial cards. "Business clients" is the closest HQ can get, but if a business client pays with an ordinary debit or credit card the fee is technically not allowed. If in doubt, choose "Don't add a fee" and build it into your prices, or offer a discount for bank transfer.</p></div>
      <div class="wide toolbar"><button class="btn" type="submit">Save payment settings</button>${stripeStatus === true ? '<button class="btn secondary" type="button" onclick="checkCardPayments()">Check for card payments now</button>' : ""}</div>
    </form>`,
  );
}
function saveCardFee(e) {
  e.preventDefault();
  const d = data(e);
  db.company = { ...(db.company || {}), cardFeeMode: d.cardFeeMode === "none" ? "none" : "business", cardFeePct: Number(d.cardFeePct) || 0, cardFeeFixed: Number(d.cardFeeFixed) || 0, depositPct: Math.min(100, Math.max(0, Number(d.depositPct) || 0)), balanceDays: Math.min(90, Math.max(0, Math.round(Number(d.balanceDays) || 0))) };
  save();
  render();
  toast("Payment settings saved");
}
async function checkCardPayments() {
  try {
    const r = await fetch("/api/payments/check", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (!r.ok) throw Error(await r.text());
    const { recorded } = await r.json();
    toast(recorded ? `${recorded} card payment${recorded > 1 ? "s" : ""} recorded. Reload to see them.` : "No new card payments.");
  } catch (err) {
    alert("Couldn't check Stripe. " + err.message);
  }
}

// ---------- Contract (terms the client signs when accepting) ----------
const TERMS_DRAFT = `AUDIO & EVENT PRODUCTION SERVICE AGREEMENT

This agreement is between [company name] ("we", "us") and [client name] ("you") for [project name] on [event date] at [venue].

1. The booking
1.1 Your booking is confirmed when you accept our quotation online. The equipment, crew and services are as listed in the accepted quotation.
1.2 Changes to the equipment, times or venue must be agreed with us in writing and may change the price.

2. Payment
2.1 Full payment is due no later than 7 days before the event date, unless your invoice says otherwise.
2.2 If payment has not been received by then, we may cancel the booking and release the equipment and crew.
2.3 Card payments are processed by Stripe. Bank transfers must quote the invoice number as the reference.

3. Cancellation
3.1 If you cancel more than 28 days before the event, we will refund anything you have paid, less any costs we have already incurred (for example cross-hired equipment or booked crew).
3.2 If you cancel 28 days or less before the event, 50% of the total is payable. If you cancel 7 days or less before the event, the full amount is payable.

4. The venue and access
4.1 You will make sure we have safe access to the venue at the agreed times, including loading, parking and power suitable for the equipment.
4.2 Delays caused by access, the venue or other suppliers may be charged as additional crew time.

5. Equipment
5.1 Our equipment remains our property at all times. On dry hire, you are responsible for it from delivery or collection until it is returned to us.
5.2 Loss of or damage to equipment while in your care (other than fair wear and tear) will be charged at repair or replacement cost.
5.3 All our electrical equipment is PAT tested. Our insurance and PAT certificates are available once the invoice is paid.

6. Safety
6.1 Our technicians may refuse to operate or may switch off equipment if they believe it is unsafe to continue, including in severe weather.
6.2 Sound levels are managed to protect the audience and crew and to meet the venue's and licensing conditions.

7. Liability
7.1 Our liability to you is limited to the total price of the booking, except for death or personal injury caused by our negligence, or anything else that cannot be limited by law.
7.2 We are not liable for losses caused by events outside our reasonable control.

8. General
8.1 These terms, with the accepted quotation, are the whole agreement between us.
8.2 This agreement is governed by the law of England and Wales.`;
function contractsPanel() {
  const co = db.company || {};
  const box = (key, titleKey, label, placeholderTitle) => `<div class="wide"><h3 style="margin:14px 0 6px">${label}</h3>
    <label><span class="muted">Title the client sees</span><input class="field" name="${titleKey}" value="${esc(co[titleKey] || "")}" placeholder="${placeholderTitle}"></label>
    <label><span class="muted">Wording</span><textarea class="field" name="${key}" rows="10" placeholder="Paste your contract wording here. Leave empty for no contract.">${esc(co[key] || "")}</textarea></label>
    <button class="btn small secondary" type="button" onclick="insertTermsDraft('${key}')">${co[key] ? "Replace with" : "Start from"} the draft wording</button></div>`;
  return panel(
    "Contract clients sign",
    `<p class="hint">When a client accepts a quote online they must tick that they agree to this contract and type their name. HQ keeps a signed copy with the date, time and IP address; they can view and print it from their link. Each job chooses which contract applies (Jobs → Edit → <b>Contract the client signs</b>).<br>You can use these tokens, filled in for each job: <code>[client name]</code> <code>[client company]</code> <code>[company name]</code> <code>[project name]</code> <code>[event date]</code> <code>[venue]</code> <code>[invoice number]</code>. 17hats tokens such as <code>[account] Company name</code> and <code>[project] Project name</code> also work.</p>
    <form class="form" onsubmit="saveTerms(event)">${box("termsHire", "termsHireTitle", "Equipment hire and production (Terms of Hire)", "Terms of Hire")}${box("termsInstall", "termsInstallTitle", "Installations", "Installation Agreement")}
    <div class="wide"><p class="hint"><b>The draft wording is a starting point only.</b> Paste your own 17hats AUDIO HIRE CONTRACT and INSTALL CONTRACT wording, or have the draft checked before you rely on it. Changing the wording doesn't affect contracts already signed.</p><button class="btn" type="submit">Save contracts</button></div></form>`,
  );
}
function insertTermsDraft(key) {
  const el = document.querySelector(`textarea[name="${key}"]`);
  if (el.value.trim() && !confirm("Replace the wording in this box with the draft?")) return;
  el.value = TERMS_DRAFT;
  el.focus();
}
function saveTerms(e) {
  e.preventDefault();
  const d = data(e);
  db.company = { ...(db.company || {}), termsHire: d.termsHire.trim(), termsInstall: d.termsInstall.trim(), termsHireTitle: d.termsHireTitle.trim(), termsInstallTitle: d.termsInstallTitle.trim() };
  save();
  render();
  toast("Contracts saved");
}

// ---------- Documents clients get once paid ----------
const CLIENT_DOC_NAMES = ["PAT test certificate", "Public liability insurance certificate", "Risk assessment", "Method statement", "Electrical installation certificate"];
function clientDocsPanel() {
  const docs = (db.company || {}).clientDocs || [];
  const today = new Date().toISOString().slice(0, 10),
    soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const row = (d, i) => {
    const st = !d.expires ? "" : d.expires < today ? '<span class="tag danger-tag">Expired: hidden from clients</span>' : d.expires < soon ? '<span class="tag warning">Expires soon</span>' : '<span class="tag success">Valid</span>';
    return `<div class="line"><div><b>${esc(d.name)}</b> ${st}<div class="muted">${d.expires ? "Valid to " + fmtDay(d.expires, { day: "numeric", month: "short", year: "numeric" }) : "No expiry date"} · <a href="${esc(d.url)}" target="_blank" rel="noopener">open</a></div></div><div class="toolbar" style="margin:0"><input class="field" type="date" value="${esc(d.expires || "")}" aria-label="Expiry date for ${esc(d.name)}" onchange="setClientDocExpiry(${i},this.value)" style="max-width:170px"><button class="btn small danger" onclick="removeClientDoc(${i})">Remove</button></div></div>`;
  };
  return panel(
    "Documents clients get once they've paid",
    `<p class="hint">When an invoice is fully paid (by card, or when you mark it paid), these appear on the client's invoice link as downloads, ready for their venue and safety file. Set an expiry date and HQ stops sharing a certificate once it runs out, and warns you 30 days before.</p>
    ${docs.map(row).join("") || '<p class="empty">No documents yet.</p>'}
    <form class="form" onsubmit="addClientDoc(event)" style="margin-top:12px">
      <label><span class="muted">Document</span><input class="field" name="name" list="clientDocNames" required placeholder="e.g. PAT test certificate"><datalist id="clientDocNames">${CLIENT_DOC_NAMES.map((n) => `<option value="${n}">`).join("")}</datalist></label>
      <label><span class="muted">Valid to (optional)</span><input class="field" type="date" name="expires"></label>
      <label class="wide"><span class="muted">File (PDF, Word or image, up to 25 MB)</span><input class="field" type="file" name="file" required accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"></label>
      <div class="wide"><button class="btn" type="submit">Add document</button></div>
    </form>`,
  );
}
async function addClientDoc(e) {
  e.preventDefault();
  const f = e.target, file = f.file.files[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) return alert("Please use a file under 25 MB.");
  const btn = f.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Uploading…";
  try {
    const url = await uploadImage(file, "clientdocs");
    const doc = { name: f.name.value.trim(), url, ...(f.expires.value ? { expires: f.expires.value } : {}) };
    db.company = { ...(db.company || {}), clientDocs: [...((db.company || {}).clientDocs || []), doc] };
    save();
    render();
    toast(esc(doc.name) + " added");
  } catch (err) {
    alert("Not uploaded. " + err.message);
    btn.disabled = false;
    btn.textContent = "Add document";
  }
}
function setClientDocExpiry(i, value) {
  const docs = [...((db.company || {}).clientDocs || [])];
  if (!docs[i]) return;
  docs[i] = { ...docs[i] };
  if (value) docs[i].expires = value;
  else delete docs[i].expires;
  db.company = { ...db.company, clientDocs: docs };
  save();
  render();
}
function removeClientDoc(i) {
  const docs = (db.company || {}).clientDocs || [];
  if (!docs[i] || !confirm(`Stop giving clients "${docs[i].name}"?`)) return;
  db.company = { ...db.company, clientDocs: docs.filter((_, n) => n !== i) };
  save();
  render();
}
// Certificates about to run out, for the Overview.
function clientDocAlerts() {
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  return ((db.company || {}).clientDocs || []).filter((d) => d.expires && d.expires < soon);
}
