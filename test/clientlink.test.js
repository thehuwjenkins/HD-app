import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createSign} from 'node:crypto';
import {makeD1, makeR2, sampleState, seedLegacy, assets} from './fakes.js';
import {loadState} from '../src/store.js';
import {quoteSummary, nextInvoiceNo} from '../public/app/stock.js';
import worker from '../src/worker.js';

const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const jwk = {...publicKey.export({format: 'jwk'}), kid: 'q1', alg: 'RS256'};
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const TEAM = 'qtest';
const token = (email) => { const now = Math.floor(Date.now() / 1000); const body = b64({alg: 'RS256', kid: 'q1'}) + '.' + b64({iss: `https://${TEAM}.cloudflareaccess.com`, aud: ['aud'], exp: now + 600, sub: 'u', email}); return body + '.' + createSign('RSA-SHA256').update(body).sign(privateKey).toString('base64url'); };
const prev = globalThis.fetch;
globalThis.fetch = async (url, init) => (String(url) === `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs` ? new Response(JSON.stringify({keys: [jwk]})) : prev(url, init));
const O = 'https://hq.example', OWNER = 'huw@example.com', TOK = 'a'.repeat(40);

async function setup(job = {}) {
  const env = {ACCESS_TEAM: TEAM, ACCESS_AUD: 'aud', OWNER_EMAIL: OWNER, DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2(), ASSETS: assets};
  const s = sampleState();
  s.clients[0].email = 'hall@example.com';
  s.company = {name: 'HD Events', bankDetails: 'Sort 00-00-00 Acc 12345678'};
  Object.assign(s.jobs[0], {stage: 'quote', booking: 'Draft', clientId: 20, quoteToken: TOK, quoteSentAt: new Date().toISOString(), discount: 10,
    kit: [{item: 'Nexo PS10', qty: 2, price: 45, category: 'Audio'}, {item: 'Sound engineer', qty: 1, time: 2, unit: 'day', price: 200, category: 'Labour / Crew', external: true}]}, job);
  seedLegacy(env, s);
  const r = await worker.fetch(new Request(O + '/api/migrate', {method: 'POST', headers: {'Cf-Access-Jwt-Assertion': token(OWNER), origin: O, 'content-type': 'application/json'}, body: '{}'}), env);
  assert.equal(r.status, 200);
  return env;
}
const get = (env, path) => worker.fetch(new Request(O + path), env);
const accept = (env, fields, origin = O) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return worker.fetch(new Request(O + '/q/' + TOK + '/accept', {method: 'POST', headers: {origin}, body: f}), env); };

test('quote figures: sections, crew itemised, discount, VAT only when registered', () => {
  const q = quoteSummary({discount: 10, kit: [{item: 'PS10', qty: 2, price: 45, category: 'Audio'}, {item: 'Par', qty: 4, price: 5, category: 'Lighting'}, {item: 'Engineer', qty: 2, time: 3, unit: 'day', price: 180, category: 'Labour / Crew'}]});
  assert.deepEqual(q.sections.map((x) => [x.name, x.total]), [['Audio', 90], ['Lighting', 20]]);
  assert.deepEqual(q.crew, [{role: 'Engineer', people: 2, time: 3, unit: 'day', rate: 180, total: 1080}]);
  assert.deepEqual([q.sub, q.discount, q.net, q.vat, q.gross], [1190, 10, 1180, 0, 1180]);
  assert.equal(quoteSummary({kit: [{item: 'x', qty: 1, price: 100}]}, {vatRegistered: true}).gross, 120);
  assert.equal(nextInvoiceNo([{invoiceNo: 'HD-1004'}, {}]), 'HD-1005');
  assert.equal(nextInvoiceNo([]), 'HD-1001');
});

test('the client opens their quote without signing in, and sees only client-facing figures', async () => {
  const env = await setup();
  const r = await get(env, '/q/' + TOK);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /QUOTATION/);
  assert.match(html, /Summer Fete/);
  assert.match(html, /Audio equipment[\s\S]*£90\.00/);
  assert.match(html, /Sound engineer[\s\S]*1 crew × 2 days[\s\S]*£200\.00 \/ day[\s\S]*£400\.00/);
  assert.match(html, /Total<\/td><td class="num">£480\.00/);
  assert.match(html, /Accept quote/);
  assert.doesNotMatch(html, /£45\.00/, 'equipment unit prices stay private');
  assert.equal((await get(env, '/q/' + 'b'.repeat(40))).status, 404);
  assert.equal((await get(env, '/q/logo.png')).headers.get('content-type'), 'image/png');
  // Anything else still needs signing in.
  assert.equal((await get(env, '/')).status, 403);
});

test('client acceptance books the job, creates the invoice and turns the link into the invoice', async () => {
  const env = await setup();
  assert.equal((await accept(env, {name: 'Jo Hall', agree: 'on'}, 'https://evil.example')).status, 403);
  assert.equal((await accept(env, {name: 'Jo Hall'})).status, 400, 'must tick to accept');
  const r = await accept(env, {name: 'Jo Hall', agree: 'on'});
  assert.equal(r.status, 303);
  const job = (await loadState(env)).state.jobs[0];
  assert.equal(job.stage, 'booked');
  assert.equal(job.booking, 'Reserved');
  assert.equal(job.acceptedBy, 'Jo Hall');
  assert.equal(job.acceptedVia, 'client link');
  assert.equal(job.invoiceNo, 'HD-1001');
  const html = await (await get(env, '/q/' + TOK)).text();
  assert.match(html, /INVOICE/);
  assert.match(html, /HD-1001/);
  assert.match(html, /Sort 00-00-00/);
  assert.doesNotMatch(html, /Accept quote/);
  // Accepting twice changes nothing.
  assert.equal((await accept(env, {name: 'Someone', agree: 'on'})).status, 303);
  assert.equal((await loadState(env)).state.jobs[0].acceptedBy, 'Jo Hall');
});

test('if stock or dates stop automatic booking, the acceptance is kept for Huw to book', async () => {
  const env = await setup({kit: [{item: 'Nexo PS10', qty: 99, price: 45, category: 'Audio'}]});
  assert.equal((await accept(env, {name: 'Jo Hall', agree: 'on'})).status, 303);
  const job = (await loadState(env)).state.jobs[0];
  assert.equal(job.stage, 'quote');
  assert.equal(job.acceptedBy, 'Jo Hall');
  assert.match(job.needsBooking, /Not enough Nexo PS10/);
  assert.match(await (await get(env, '/q/' + TOK)).text(), /Quote accepted by Jo Hall/);
});

test('quotes expire after 30 days', async () => {
  const env = await setup({quoteSentAt: new Date(Date.now() - 31 * 86400000).toISOString()});
  assert.match(await (await get(env, '/q/' + TOK)).text(), /This quote expired/);
  await accept(env, {name: 'Late', agree: 'on'});
  assert.equal((await loadState(env)).state.jobs[0].acceptedAt, undefined);
});
