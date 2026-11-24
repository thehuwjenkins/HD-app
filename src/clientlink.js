// The client's quote link: /q/<token>. No sign-in (Cloudflare Access bypasses /q only); the long random
// token is the key, and the page shows just that one job's quote. The client can accept it online.
// After acceptance the same link shows the invoice with payment details.
import {loadState, applyChanges, Conflict, Invalid} from './store.js';
import {quoteSummary, nextInvoiceNo, shortages, bounds} from '../public/app/stock.js';
import {escapeText as e} from './pages.js';

export const TOKEN = /^[0-9a-f]{40}$/;
export const QUOTE_DAYS = 30;
const money = (n) => '£' + (Number(n) || 0).toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const day = (s) => (s ? new Date(String(s).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}) : '');
const addDays = (iso, n) => new Date(new Date(iso).getTime() + n * 86400000).toISOString();
const headers = {'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; script-src 'unsafe-inline'"};
const page = (body, status = 200) => new Response(body, {status, headers: {...headers, 'content-type': 'text/html;charset=utf-8'}});

function findJob(state, token) {
  return state.jobs.find((j) => j.quoteToken === token);
}
export const expired = (job, now = Date.now()) => !job.acceptedAt && job.quoteSentAt && now > new Date(job.quoteSentAt).getTime() + QUOTE_DAYS * 86400000;
const dateRange = (j) => {
  const a = String(j.start || '').slice(0, 10), b = String(j.end || '').slice(0, 10);
  return !a ? '' : b && b !== a ? day(a) + ' to ' + day(b) : day(a);
};

function shell(title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${e(title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#eef1f6;color:#111827;font:16px/1.5 Arial,Helvetica,sans-serif}
.sheet{max-width:820px;margin:24px auto;background:#fff;padding:32px;border-radius:16px;box-shadow:0 6px 30px #0f16301a}
.ph{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:3px solid #111827;padding-bottom:12px;position:relative;flex-wrap:wrap}
.ph:after{content:"";position:absolute;left:0;right:0;bottom:-6px;height:3px;background:linear-gradient(90deg,#00eeed,#9145ff)}
.ph img{height:80px;width:auto;margin:-8px 0 -4px -6px}.co{font-size:13px;color:#374151}.ph-r{text-align:right}.ph-r h1{margin:0;font-size:24px;letter-spacing:.04em}.ph-r div{font-size:13px;color:#374151}
.title{font-size:26px;font-weight:700;margin:22px 0 12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 28px}.grid h3{margin:0 0 4px;font-size:14px;color:#374151}
table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #c5ccd6;padding:8px 10px;text-align:left}th{background:#eef1f6;font-size:12px;text-transform:uppercase}.num{text-align:right}.cat td{background:#f6f8fb;font-weight:700}
.totals{width:60%;margin-left:auto}.totals td{border:0;border-bottom:1px solid #e5e7eb}.grand td{font-size:18px;font-weight:700;border-top:2px solid #111827}
.note{margin-top:16px;padding:12px 14px;border:1px solid #c5ccd6;border-radius:10px;white-space:pre-wrap}
.accept{margin-top:22px;padding:18px;border-radius:14px;background:linear-gradient(120deg,#e6fbfb,#f1eaff);border:1px solid #cfc2f7}
.accept label{display:block;margin:8px 0}.accept input[type=text]{font:inherit;width:100%;padding:12px;border:1px solid #b4bfce;border-radius:10px}
.accept input[type=checkbox]{width:20px;height:20px;vertical-align:-4px;margin-right:8px;accent-color:#6d35e8}
button,.btn{font:600 17px Arial,sans-serif;border:0;border-radius:30px;padding:14px 26px;color:#fff;background:linear-gradient(120deg,#00808c,#2f6fd0,#6d35e8);cursor:pointer;text-decoration:none;display:inline-block}
.plain{background:#fff;color:#0f1630;border:1px solid #b4bfce}.ok{background:#e1f4ea;color:#0f6138;border-radius:12px;padding:12px 14px;font-weight:700}.warn{background:#fff1dc;color:#8a4500;border-radius:12px;padding:12px 14px}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
@media(max-width:600px){.sheet{margin:0;border-radius:0;padding:18px}.grid{grid-template-columns:1fr}.totals{width:100%}}
@media print{body{background:#fff}.sheet{box-shadow:none;margin:0;padding:0}.actions,.accept form{display:none}@page{size:A4;margin:12mm}.ph:after,th,.cat td{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="sheet">${inner}</div></body></html>`;
}

function render(state, job, msg = '') {
  const co = state.company || {};
  const c = state.clients.find((x) => String(x.id) === String(job.clientId)) || {};
  const q = quoteSummary(job, {vatRegistered: !!co.vatNumber});
  const accepted = !!job.acceptedAt;
  const isInvoice = accepted && job.invoiceNo;
  const contact = [co.address, [co.phone, co.email].filter(Boolean).join(' · '), co.website].filter(Boolean).map(e).join('<br>');
  const ref = isInvoice ? job.invoiceNo : 'Ref ' + job.id;
  const rows = q.sections.map((x) => `<tr><td>${e(x.name)}${['Transport', 'Install'].includes(x.name) ? '' : ' equipment'}</td><td></td><td></td><td class="num">${money(x.total)}</td></tr>`).join('')
    + (q.crew.length ? '<tr class="cat"><td colspan="4">Crew</td></tr>' + q.crew.map((k) => `<tr><td>${e(k.role)}</td><td>${k.people} crew × ${k.time} ${k.unit}${k.time === 1 ? '' : 's'}</td><td class="num">${money(k.rate)} / ${k.unit}</td><td class="num">${money(k.total)}</td></tr>`).join('') : '');
  const totals = `<table class="totals"><tbody>${q.discount ? `<tr><td>Subtotal</td><td class="num">${money(q.sub)}</td></tr><tr><td>Discount</td><td class="num">−${money(q.discount)}</td></tr>` : ''}${q.vat ? `<tr><td>Total ex VAT</td><td class="num">${money(q.net)}</td></tr><tr><td>VAT at 20%</td><td class="num">${money(q.vat)}</td></tr>` : ''}<tr class="grand"><td>${q.vat ? 'Total inc VAT' : 'Total'}</td><td class="num">${money(q.gross)}</td></tr></tbody></table>`;
  const billTo = [c.company, c.name || job.client, c.address, c.email, c.phone].filter(Boolean).map(e).join('<br>') || e(job.client || '');
  const validUntil = job.quoteSentAt ? day(addDays(job.quoteSentAt, QUOTE_DAYS)) : '';
  const due = isInvoice ? day(addDays(job.invoiceDate + 'T12:00:00Z', Number(co.paymentDays) || 30)) : '';
  let after = '';
  if (isInvoice) {
    after = `<h2>How to pay</h2><div class="note">${co.bankDetails ? e(co.bankDetails) : 'Payment details will follow from ' + e(co.name || 'HD Events') + '.'}
Please use ${e(job.invoiceNo)} as the payment reference.${co.paymentTerms ? '\n' + e(co.paymentTerms) : ''}${co.vatNumber ? '' : '\nNot VAT registered: no VAT has been charged.'}</div>`;
  } else if (accepted) {
    after = `<p class="ok">Quote accepted by ${e(job.acceptedBy || 'you')} on ${e(day(job.acceptedAt))}. Thank you, we'll be in touch to confirm the details.</p>`;
  } else if (expired(job)) {
    after = `<p class="warn">This quote expired on ${e(validUntil)}. Please contact ${e(co.name || 'HD Events')} for an updated quote.</p>`;
  } else {
    after = `<div class="accept"><h2 style="margin-top:0">Happy to go ahead?</h2><p>Accept this quote online and we'll book your equipment and crew.</p>
      <form method="post" action="/q/${job.quoteToken}/accept"><label>Your name<input type="text" name="name" required maxlength="80" autocomplete="name"></label>
      <label><input type="checkbox" name="agree" required>I accept this quotation of ${money(q.gross)} for ${e(job.title)}.</label><button>Accept quote</button></form></div>`;
  }
  return shell((isInvoice ? 'Invoice ' : 'Quotation · ') + job.title, `
    <div class="ph"><div><img src="/q/logo.png" alt="${e(co.name || 'HD Events')}"><div class="co">${contact}</div></div><div class="ph-r"><h1>${isInvoice ? 'INVOICE' : 'QUOTATION'}</h1><div>${e(ref)}</div>${isInvoice ? `<div>Date ${e(day(job.invoiceDate))}</div><div>Payment due ${e(due)}</div>` : validUntil ? `<div>Valid until ${e(validUntil)}</div>` : ''}</div></div>
    ${msg ? `<p class="ok">${e(msg)}</p>` : ''}
    <div class="title">${e(job.title)}</div>
    <div class="grid"><div><h3>${isInvoice ? 'Bill to' : 'Prepared for'}</h3>${billTo}</div><div><h3>Event</h3>${e(dateRange(job))}${job.venue ? '<br>' + e(job.venue) : ''}</div></div>
    <table><thead><tr><th>Description</th><th>Quantity</th><th class="num">Rate</th><th class="num">Total</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Details to follow.</td></tr>'}</tbody></table>${totals}
    ${isInvoice ? '' : `<div class="note">${co.vatNumber ? 'Prices include VAT at 20% where shown. ' : ''}This quotation is valid for ${QUOTE_DAYS} days. Equipment is reserved once the booking is confirmed.${co.paymentTerms ? '\n\nPayment terms: ' + e(co.paymentTerms) : ''}</div>`}
    ${after}
    <div class="actions"><button class="plain" type="button" onclick="print()">Print / save as PDF</button></div>`);
}

// What accepting does: books the job (if the stock allows), creates the invoice and records who accepted.
export function acceptedJob(state, job, by, via) {
  const now = new Date().toISOString();
  const base = {...job, acceptedAt: job.acceptedAt || now, acceptedBy: by, acceptedVia: via};
  const booked = {...base, stage: 'booked', booking: 'Reserved', invoiceNo: job.invoiceNo || nextInvoiceNo(state.jobs), invoiceDate: job.invoiceDate || now.slice(0, 10)};
  const [a, b] = bounds(booked);
  const problem = !(b > a) ? 'Event dates are needed before booking.' : !(booked.kit || []).length ? 'No equipment on the job yet.' : (shortages(booked, state)[0] ? 'Not enough ' + shortages(booked, state)[0].name + ' in stock.' : '');
  // If it can't be booked automatically, keep it at Quote sent, marked as accepted, for Huw to sort out.
  return problem ? {job: {...base, stage: 'quote', booking: 'Draft', needsBooking: problem}, booked: false} : {job: (({needsBooking, ...rest}) => rest)(booked), booked: true};
}

export async function handleClientLink(req, env, url) {
  const m = /^\/q\/([0-9a-f]{40})(\/accept)?$/.exec(url.pathname);
  if (url.pathname === '/q/logo.png') return null; // served by the worker from the bundled files
  if (!m) return page(shell('Not found', '<p>This link is not valid.</p>'), 404);
  const [, token, accept] = m;
  for (let attempt = 0; attempt < 2; attempt++) {
    const {state, versions} = await loadState(env);
    const job = findJob(state, token);
    if (!job) return page(shell('Not found', '<p>This quote link is no longer active. Please contact HD Events.</p>'), 404);
    if (!accept) {
      if (req.method !== 'GET') return page('Not found', 404);
      return page(render(state, job, url.searchParams.get('accepted') ? 'Thank you. Your acceptance has been recorded.' : ''));
    }
    if (req.method !== 'POST' || req.headers.get('origin') !== url.origin) return page('Forbidden', 403);
    if (job.acceptedAt) return Response.redirect(url.origin + '/q/' + token, 303);
    if (expired(job)) return Response.redirect(url.origin + '/q/' + token, 303);
    const form = await req.formData().catch(() => null);
    const name = String(form?.get('name') || '').trim().slice(0, 80);
    if (!name || form.get('agree') !== 'on') return page(render(state, job, ''), 400);
    const {job: next} = acceptedJob(state, job, name, 'client link');
    try {
      await applyChanges(env, 'client: ' + name, [{collection: 'jobs', id: job.id, op: 'put', version: versions.jobs[job.id], data: next}], {reason: 'client accepted quote'});
      return Response.redirect(url.origin + '/q/' + token + '?accepted=1', 303);
    } catch (err) {
      if (err instanceof Conflict && attempt === 0) continue; // someone saved at the same moment: try once more
      if (err instanceof Invalid) {
        const fallback = {...job, acceptedAt: new Date().toISOString(), acceptedBy: name, acceptedVia: 'client link', needsBooking: 'Accepted, but could not be booked automatically: ' + err.message};
        await applyChanges(env, 'client: ' + name, [{collection: 'jobs', id: job.id, op: 'put', version: versions.jobs[job.id], data: fallback}], {reason: 'client accepted quote'});
        return Response.redirect(url.origin + '/q/' + token + '?accepted=1', 303);
      }
      throw err;
    }
  }
  return page(shell('Busy', '<p>Please try again in a moment.</p>'), 503);
}
