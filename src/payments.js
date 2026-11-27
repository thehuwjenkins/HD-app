// Card payments through Stripe Checkout. The client presses "Pay by card" on their invoice link, pays on
// Stripe's own page (cards, Apple Pay, Google Pay), and comes back to the link. We then ask Stripe
// whether that payment went through and record it on the job. Sessions that never came back (the client
// closed the tab) are checked again whenever the link is opened and by the daily scheduled run.
// Needs the Cloudflare secret STRIPE_SECRET_KEY (a restricted key with Checkout Sessions write is enough).
import {loadState, applyChanges, Conflict} from './store.js';
import {cardFee, paymentStatus, withPayments} from '../public/app/stock.js';

const API = 'https://api.stripe.com/v1/';
const pence = (n) => Math.round(n * 100);
const PENDING_DAYS = 3;

export const stripeReady = (env) => !!env.STRIPE_SECRET_KEY;

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}
async function stripe(env, method, path, params) {
  const r = await fetch(API + path, {method, headers: {authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, ...(params ? {'content-type': 'application/x-www-form-urlencoded'} : {})}, body: params ? form(params) : undefined});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(Error(d.error?.message || 'Stripe request failed'), {status: 502});
  return d;
}

// What a card payment would charge now: the amount still due (or just the deposit still owed),
// plus the card fee if one applies.
export function cardCharge(state, job, part = 'full') {
  const co = state.company || {};
  const client = state.clients.find((x) => String(x.id) === String(job.clientId)) || {};
  const ps = paymentStatus(job, {vatRegistered: !!co.vatNumber, company: co});
  const due = part === 'deposit' && ps.depositOwed > 0 ? Math.min(ps.depositOwed, ps.due) : ps.due;
  const fee = cardFee(due, co, client);
  return {due, fee, total: Math.round((due + fee) * 100) / 100, client, deposit: part === 'deposit' && ps.depositOwed > 0};
}

export async function createCheckout(env, state, job, origin, part = 'full') {
  const {due, fee, client, deposit} = cardCharge(state, job, part);
  if (!(due > 0)) throw Object.assign(Error('Nothing left to pay on this invoice.'), {status: 400});
  const co = state.company || {};
  const items = [{quantity: 1, price_data: {currency: 'gbp', unit_amount: pence(due), product_data: {name: `${deposit ? 'Deposit · ' : ''}${job.invoiceNo} · ${job.title}`.slice(0, 250)}}}];
  if (fee > 0) items.push({quantity: 1, price_data: {currency: 'gbp', unit_amount: pence(fee), product_data: {name: 'Card processing fee'}}});
  const base = `${origin}/q/${job.quoteToken}`;
  const s = await stripe(env, 'POST', 'checkout/sessions', {
    mode: 'payment', line_items: Object.fromEntries(items.map((x, i) => [i, x])),
    success_url: base + '/paid?s={CHECKOUT_SESSION_ID}', cancel_url: base,
    client_reference_id: job.invoiceNo, customer_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email || '') ? client.email : undefined,
    metadata: {token: job.quoteToken, job: String(job.id), invoice: job.invoiceNo, due: due.toFixed(2), fee: fee.toFixed(2), kind: deposit ? 'deposit' : 'payment'},
    payment_intent_data: {description: `${co.name || 'HD Events'} ${job.invoiceNo}`, metadata: {invoice: job.invoiceNo, job: String(job.id)}},
  });
  return {id: s.id, url: s.url};
}

// The job after a Stripe session that has been paid, or null if it isn't paid (yet) or is already recorded.
export function withPayment(job, session, opts = {}) {
  if (session.payment_status !== 'paid' || session.metadata?.token !== job.quoteToken) return null;
  if ((job.payments || []).some((p) => p.ref === session.id)) return null;
  const amount = Number(session.metadata.due), fee = Number(session.metadata.fee) || 0;
  if (!(amount > 0)) return null;
  const entry = {at: new Date().toISOString(), amount, fee, method: 'card', ref: session.id, kind: session.metadata.kind === 'deposit' ? 'deposit' : 'payment'};
  const next = withPayments(job, [...(job.payments || []), entry], opts);
  return {...next, cardSessions: (job.cardSessions || []).filter((x) => x.id !== session.id)};
}

async function saveJob(env, jobId, change, reason) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const {state, versions} = await loadState(env);
    const job = state.jobs.find((j) => j.id === jobId);
    const next = job && change(job, state);
    if (!next) return job;
    try {
      await applyChanges(env, 'stripe', [{collection: 'jobs', id: jobId, op: 'put', version: versions.jobs[jobId], data: next}], {reason});
      return next;
    } catch (err) {
      if (!(err instanceof Conflict)) throw err;
    }
  }
  throw Object.assign(Error('Busy, please try again.'), {status: 503});
}

export function rememberSession(env, jobId, id) {
  const cutoff = Date.now() - PENDING_DAYS * 86400000;
  return saveJob(env, jobId, (job) => ({...job, cardSessions: [...(job.cardSessions || []).filter((x) => Date.parse(x.at) > cutoff), {id, at: new Date().toISOString()}]}), 'card payment started');
}

// Ask Stripe about one session (or every pending one) and record anything paid.
export async function confirmSessions(env, jobId, ids) {
  const paid = [];
  for (const id of ids) {
    if (!/^cs_[A-Za-z0-9_]+$/.test(id)) continue;
    const s = await stripe(env, 'GET', 'checkout/sessions/' + id);
    if (s.payment_status === 'paid') paid.push(s);
    else if (s.status === 'expired') await saveJob(env, jobId, (job) => (job.cardSessions || []).some((x) => x.id === id) ? {...job, cardSessions: job.cardSessions.filter((x) => x.id !== id)} : null, 'card payment expired');
  }
  for (const s of paid) await saveJob(env, jobId, (job, state) => withPayment(job, s, {vatRegistered: !!state.company?.vatNumber, company: state.company || {}}), 'card payment received');
  return paid.length;
}

// Daily: pick up card payments whose client never came back to the link.
export async function checkPendingPayments(env) {
  if (!stripeReady(env)) return 0;
  const {state} = await loadState(env);
  let n = 0;
  for (const job of state.jobs) if ((job.cardSessions || []).length) n += await confirmSessions(env, job.id, job.cardSessions.map((x) => x.id)).catch(() => 0);
  return n;
}
