import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createSign} from 'node:crypto';
import {makeD1, makeR2, sampleState, seedLegacy, assets} from './fakes.js';
import {loadState} from '../src/store.js';
import {cardFee, jobTerms, paymentStatus} from '../public/app/stock.js';
import worker from '../src/worker.js';

const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const jwk = {...publicKey.export({format: 'jwk'}), kid: 'p1', alg: 'RS256'};
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const TEAM = 'ptest';
const jwt = (email) => { const now = Math.floor(Date.now() / 1000); const body = b64({alg: 'RS256', kid: 'p1'}) + '.' + b64({iss: `https://${TEAM}.cloudflareaccess.com`, aud: ['aud'], exp: now + 600, sub: 'u', email}); return body + '.' + createSign('RSA-SHA256').update(body).sign(privateKey).toString('base64url'); };

// Fake Stripe: records what we send, and answers session lookups from `sessions`.
const stripeCalls = [], sessions = {};
const prev = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u === `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`) return new Response(JSON.stringify({keys: [jwk]}));
  if (u.startsWith('https://api.stripe.com/v1/')) {
    stripeCalls.push({url: u, method: init.method, auth: init.headers?.authorization, body: init.body ? new URLSearchParams(String(init.body)) : null});
    if (init.method === 'POST') {
      const id = 'cs_test_' + stripeCalls.length, b = new URLSearchParams(String(init.body));
      sessions[id] = {id, payment_status: 'unpaid', status: 'open', metadata: {token: b.get('metadata[token]'), due: b.get('metadata[due]'), fee: b.get('metadata[fee]')}};
      return new Response(JSON.stringify({id, url: 'https://checkout.stripe.com/c/pay/' + id}));
    }
    const s = sessions[u.split('/').pop()];
    return s ? new Response(JSON.stringify(s)) : new Response(JSON.stringify({error: {message: 'No such session'}}), {status: 404});
  }
  return prev(url, init);
};
const O = 'https://hq.example', OWNER = 'huw@example.com', TOK = 'c'.repeat(40);

async function setup({company = {}, client = {}, env: extra = {}} = {}) {
  const env = {ACCESS_TEAM: TEAM, ACCESS_AUD: 'aud', OWNER_EMAIL: OWNER, DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2(), ASSETS: assets, ...extra};
  const s = sampleState();
  Object.assign(s.clients[0], {email: 'hall@example.com'}, client);
  s.company = {name: 'HD Events', bankDetails: 'Sort 00-00-00 Acc 12345678', ...company};
  Object.assign(s.jobs[0], {title: 'Summer Fete', venue: 'Brangwyn Hall', start: '2027-06-12T10:00', end: '2027-06-13T12:00', stage: 'quote', booking: 'Draft', clientId: 20, quoteToken: TOK, quoteSentAt: new Date().toISOString(),
    kit: [{item: 'Nexo PS10', qty: 2, price: 45, category: 'Audio'}, {item: 'Sound engineer', qty: 1, time: 2, unit: 'day', price: 200, category: 'Labour / Crew', external: true}]});
  seedLegacy(env, s);
  const r = await worker.fetch(new Request(O + '/api/migrate', {method: 'POST', headers: {'Cf-Access-Jwt-Assertion': jwt(OWNER), origin: O, 'content-type': 'application/json'}, body: '{}'}), env);
  assert.equal(r.status, 200);
  return env;
}
const get = (env, path) => worker.fetch(new Request(O + path, {redirect: 'manual'}), env);
const post = (env, path, fields = {}, headers = {}) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return worker.fetch(new Request(O + path, {method: 'POST', headers: {origin: O, ...headers}, body: f, redirect: 'manual'}), env); };
const job = async (env) => (await loadState(env)).state.jobs.find((j) => j.quoteToken === TOK);
const TERMS = 'Agreement between [account] Company name and [client name] for [project name] on [event date] at [venue]. Pay 7 days before.';

test('card fee: business clients only, grossed up to cover Stripe, never for private clients', () => {
  assert.equal(cardFee(1000, {}, {company: 'Acme Ltd'}), 15.44);
  assert.ok((1000 + 15.44) * 0.985 - 0.2 >= 1000);
  assert.equal(cardFee(1000, {}, {}), 0);
  assert.equal(cardFee(1000, {cardFeeMode: 'none'}, {company: 'Acme'}), 0);
  assert.equal(cardFee(100, {cardFeePct: 2.5, cardFeeFixed: 0.2}, {company: 'Acme'}), 2.77);
  assert.equal(cardFee(0, {}, {company: 'Acme'}), 0);
});

test('contract wording fills in the job details, including 17hats-style tokens', () => {
  const t = jobTerms({id: 3, title: 'Gala', start: '2027-06-12T10:00', venue: 'Hall', client: 'Sam'}, {name: 'HD Events', termsHire: TERMS}, {name: 'Sam Jones'});
  assert.equal(t.title, 'Terms of Hire');
  assert.equal(t.text, 'Agreement between HD Events and Sam Jones for Gala on 12 June 2027 at Hall. Pay 7 days before.');
  assert.equal(jobTerms({terms: 'none'}, {termsHire: TERMS}), null);
  assert.equal(jobTerms({terms: 'install'}, {termsHire: TERMS}), null, 'no install wording, no contract');
  assert.equal(jobTerms({}, {}), null);
});

test('the client signs the terms when accepting; a signed copy is kept and viewable', async () => {
  const env = await setup({company: {termsHire: TERMS}});
  const page = await (await get(env, '/q/' + TOK)).text();
  assert.match(page, /Terms of Hire<\/h3><div class="terms">Agreement between HD Events and/);
  assert.match(page, /Accept and sign/);
  assert.equal((await get(env, '/q/' + TOK + '/terms')).status, 303, 'nothing signed yet');
  const r = await post(env, '/q/' + TOK + '/accept', {name: 'Sam Jones', agree: 'on'}, {'cf-connecting-ip': '203.0.113.9', 'user-agent': 'Test browser'});
  assert.equal(r.status, 303);
  const j = await job(env);
  assert.equal(j.termsAgreed.name, 'Sam Jones');
  assert.equal(j.termsAgreed.ip, '203.0.113.9');
  assert.match(j.termsAgreed.text, /^Agreement between HD Events and .* for Summer Fete on 12 June 2027 at Brangwyn Hall/);
  assert.match(j.termsAgreed.hash, /^[0-9a-f]{64}$/);
  const signed = await (await get(env, '/q/' + TOK + '/terms')).text();
  assert.match(signed, /Signed electronically[\s\S]*Sam Jones[\s\S]*203\.0\.113\.9/);
  assert.match(await (await get(env, '/q/' + TOK)).text(), /Terms of Hire agreed electronically by <b>Sam Jones<\/b>/);
});

test('pay by card: fee added for a business client, payment recorded when Stripe says it is paid', async () => {
  const env = await setup({client: {company: 'Acme Events Ltd'}, env: {STRIPE_SECRET_KEY: 'sk_test_x'}});
  await post(env, '/q/' + TOK + '/accept', {name: 'Sam', agree: 'on'});
  const invoice = await (await get(env, '/q/' + TOK)).text();
  assert.match(invoice, /INVOICE/);
  assert.match(invoice, /card processing fee of <b>£7\.67<\/b>/); // £490 due
  assert.match(invoice, /Pay £497\.67 by card/);
  assert.match(invoice, /Or pay by bank transfer/);
  // Cross-site posts can't start a payment.
  assert.equal((await post(env, '/q/' + TOK + '/pay', {}, {origin: 'https://evil.example'})).status, 403);
  const r = await post(env, '/q/' + TOK + '/pay');
  assert.equal(r.status, 303);
  assert.match(r.headers.get('location'), /^https:\/\/checkout\.stripe\.com\//);
  const call = stripeCalls.at(-1);
  assert.equal(call.auth, 'Bearer sk_test_x');
  assert.equal(call.body.get('line_items[0][price_data][unit_amount]'), '49000');
  assert.equal(call.body.get('line_items[1][price_data][unit_amount]'), '767');
  assert.equal(call.body.get('line_items[1][price_data][product_data][name]'), 'Card processing fee');
  assert.equal(call.body.get('success_url'), `${O}/q/${TOK}/paid?s={CHECKOUT_SESSION_ID}`);
  const id = (await job(env)).cardSessions[0].id;
  // Coming back before the payment completes records nothing.
  await get(env, `/q/${TOK}/paid?s=${id}`);
  assert.equal((await job(env)).payments, undefined);
  sessions[id].payment_status = 'paid';
  const back = await get(env, `/q/${TOK}/paid?s=${id}`);
  assert.equal(back.headers.get('location'), `${O}/q/${TOK}?paid=1`);
  const j = await job(env);
  assert.deepEqual(j.payments.map((p) => [p.amount, p.fee, p.method, p.ref]), [[490, 7.67, 'card', id]]);
  assert.ok(j.paidAt);
  assert.deepEqual(j.cardSessions, []);
  // Coming back twice doesn't record it twice.
  await get(env, `/q/${TOK}/paid?s=${id}`);
  assert.equal((await job(env)).payments.length, 1);
  const paidPage = await (await get(env, '/q/' + TOK + '?paid=1')).text();
  assert.match(paidPage, /Your payment has been received/);
  assert.match(paidPage, /Paid in full/);
  assert.doesNotMatch(paidPage, /Pay £/);
});

test('a payment the client never came back from is picked up when the link is opened', async () => {
  const env = await setup({env: {STRIPE_SECRET_KEY: 'sk_test_x'}});
  await post(env, '/q/' + TOK + '/accept', {name: 'Sam', agree: 'on'});
  assert.match(await (await get(env, '/q/' + TOK)).text(), /Pay £490\.00 by card/, 'private client: no fee');
  await post(env, '/q/' + TOK + '/pay');
  const id = (await job(env)).cardSessions[0].id;
  sessions[id].payment_status = 'paid';
  assert.match(await (await get(env, '/q/' + TOK)).text(), /Paid in full/);
  assert.equal(paymentStatus(await job(env)).fully, true);
});

test('without Stripe the invoice shows bank transfer only', async () => {
  const env = await setup();
  await post(env, '/q/' + TOK + '/accept', {name: 'Sam', agree: 'on'});
  const html = await (await get(env, '/q/' + TOK)).text();
  assert.doesNotMatch(html, /Pay by card/);
  assert.match(html, /How to pay/);
  assert.equal((await post(env, '/q/' + TOK + '/pay')).status, 303);
});

test('PAT, insurance and risk assessment documents are released once the invoice is paid', async () => {
  const env = await setup({company: {clientDocs: [
    {name: 'PAT test certificate', url: '/files/clientdocs/' + 'a'.repeat(64) + '.pdf', expires: '2099-01-01'},
    {name: 'Old insurance', url: '/files/clientdocs/' + 'b'.repeat(64) + '.pdf', expires: '2020-01-01'},
    {name: 'Risk assessment', url: '/files/clientdocs/' + 'c'.repeat(64) + '.pdf'},
  ]}});
  await env.FILES.put('clientdocs/' + 'a'.repeat(64) + '.pdf', new TextEncoder().encode('%PDF pat'), {httpMetadata: {contentType: 'application/pdf'}});
  await env.FILES.put('clientdocs/' + 'c'.repeat(64) + '.pdf', new TextEncoder().encode('%PDF ra'), {httpMetadata: {contentType: 'application/pdf'}});
  await post(env, '/q/' + TOK + '/accept', {name: 'Sam', agree: 'on'});
  assert.doesNotMatch(await (await get(env, '/q/' + TOK)).text(), /Your event documents/);
  assert.equal((await get(env, '/q/' + TOK + '/doc/0')).status, 404, 'not until paid');
  // Huw marks it paid in HQ.
  const {state} = await loadState(env);
  const j = state.jobs.find((x) => x.quoteToken === TOK);
  const {applyChanges} = await import('../src/store.js');
  const {versions} = await loadState(env);
  await applyChanges(env, OWNER, [{collection: 'jobs', id: j.id, op: 'put', version: versions.jobs[j.id], data: {...j, paidAt: new Date().toISOString()}}]);
  const html = await (await get(env, '/q/' + TOK)).text();
  assert.match(html, /Your event documents/);
  assert.match(html, /PAT test certificate/);
  assert.match(html, /Risk assessment/);
  assert.doesNotMatch(html, /Old insurance/, 'expired certificates are held back');
  const d = await get(env, '/q/' + TOK + '/doc/0');
  assert.equal(d.status, 200);
  assert.equal(d.headers.get('content-disposition'), 'attachment; filename="PAT test certificate.pdf"');
  assert.equal(await d.text(), '%PDF pat');
  assert.equal((await get(env, '/q/' + TOK + '/doc/1')).status, 404, 'expired');
  assert.equal((await get(env, '/q/' + 'd'.repeat(40) + '/doc/0')).status, 404);
});
