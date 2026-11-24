import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createSign} from 'node:crypto';
import {makeD1, makeR2, sampleState, seedLegacy, assets} from './fakes.js';
import {validate, fingerprint} from '../public/app/stock.js';
import {migrate} from '../src/migrate.js';
import {applyChanges, loadState} from '../src/store.js';
import worker from '../src/worker.js';

function plan(extra = {}) {
  return {
    id: 900, jobId: 30, title: 'Aberravon Beach Fest', eventDate: '2027-07-24', venue: 'Aberavon Beach',
    stages: [{key: 'risk', name: 'Risk assessment', icon: '⚠️', items: [
      {id: 1, title: 'Event risk assessment', status: 'todo', owner: '', due: '2027-06-09', notes: '', files: [], doc: {kind: 'ra', content: 'Hazard: tide. Control: tide tables checked.', status: 'draft'}},
      {id: 2, title: 'Book first aid', status: 'done', owner: 'Huw', due: '', notes: '', files: [{url: '/files/plan/' + 'a'.repeat(64) + '.pdf', name: 'quote.pdf'}]},
    ]}],
    site: {address: 'Aberavon Beach', features: [{id: 5, kind: 'stage', type: 'marker', label: 'Main stage', at: [51.58, -3.81]}]},
    creative: {theme: 'Surf & sound', palette: ['#000000'], images: []}, posters: [], ...extra,
  };
}
const withPlan = p => ({...sampleState(), plans: [p]});

test('a plan with a draft document is valid', () => validate(withPlan(plan())));

test('approval needs a named approver and must match the exact text', () => {
  const p = plan(), doc = p.stages[0].items[0].doc;
  doc.status = 'approved';
  assert.throws(() => validate(withPlan(p)), /named approver/);
  doc.approval = {by: 'Huw Jenkins', at: '2026-11-23T10:00:00Z', hash: fingerprint(doc.content)};
  validate(withPlan(p));
  doc.content += ' Edited later.';
  assert.throws(() => validate(withPlan(p)), /changed after approval/);
});

test('fingerprint changes with any edit, including whitespace', () => {
  const a = 'Fire points at each stage.';
  assert.equal(fingerprint(a), fingerprint(a));
  assert.notEqual(fingerprint(a), fingerprint(a + ' '));
  assert.notEqual(fingerprint(a), fingerprint(a.replace('each', 'every')));
});

test('bad plans are refused', () => {
  assert.throws(() => validate(withPlan(plan({title: ' '}))), /needs a name/);
  const p = plan(); p.stages[0].items[1].status = 'finished';
  assert.throws(() => validate(withPlan(p)), /invalid checklist status/);
  const q = plan(); q.stages[0].items[0].doc.kind = 'novel';
  assert.throws(() => validate(withPlan(q)), /invalid document/);
});

test('plans are stored per record with searchable job, title and date', async () => {
  const env = {DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2()};
  seedLegacy(env, sampleState());
  assert.ok((await migrate(env, 'huw@example.com')).ok);
  await applyChanges(env, 'huw@example.com', [{collection: 'plans', id: 900, op: 'put', version: 0, data: plan()}]);
  assert.deepEqual({...env.DB.raw.prepare('SELECT job_id,title,event_date FROM plans').get()}, {job_id: '30', title: 'Aberravon Beach Fest', event_date: '2027-07-24'});
  assert.equal((await loadState(env)).state.plans[0].site.features[0].label, 'Main stage');
  // Tampering with an approved document is refused by the server, not just the page.
  const p = plan(), doc = p.stages[0].items[0].doc;
  doc.status = 'approved'; doc.approval = {by: 'Huw Jenkins', at: 'x', hash: 'wrong'};
  await assert.rejects(applyChanges(env, 'huw@example.com', [{collection: 'plans', id: 900, op: 'put', version: 1, data: p}]), /approved again/);
});

// ---- Through the worker ----
const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const jwk = {...publicKey.export({format: 'jwk'}), kid: 'k1', alg: 'RS256'};
const b64 = v => Buffer.from(JSON.stringify(v)).toString('base64url');
const token = email => { const now = Math.floor(Date.now() / 1000); const body = b64({alg: 'RS256', kid: 'k1'}) + '.' + b64({iss: 'https://hd.cloudflareaccess.com', aud: 'a', exp: now + 600, sub: 'u', email}); return body + '.' + createSign('RSA-SHA256').update(body).sign(privateKey).toString('base64url'); };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => String(url).endsWith('/cdn-cgi/access/certs') ? new Response(JSON.stringify({keys: [jwk]})) : realFetch(url, init);
const O = 'https://hq.example';
const call = (env, email, method, path, body, type = 'application/json') => worker.fetch(new Request(O + path, {method, headers: {'Cf-Access-Jwt-Assertion': token(email), ...(body !== undefined ? {'content-type': type, origin: O} : {})}, body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body)}), env);
async function env(extra = {}) {
  const e = {ACCESS_TEAM: 'hd', ACCESS_AUD: 'a', OWNER_EMAIL: 'huw@example.com', DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2(), ASSETS: assets, ...extra};
  seedLegacy(e, sampleState());
  await call(e, 'huw@example.com', 'POST', '/api/migrate', {});
  return e;
}
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

test('AI image: generated with Workers AI and stored as a file', async () => {
  const seen = [];
  const e = await env({AI: {run: async (model, input) => { seen.push({model, input}); return {image: JPEG.toString('base64')}; }}});
  const r = await call(e, 'huw@example.com', 'POST', '/api/ai/image', {prompt: 'Beach festival at sunset'});
  assert.equal(r.status, 200, await r.clone().text());
  const {url} = await r.json();
  assert.match(url, /^\/files\/creative\/[0-9a-f]{64}\.jpg$/);
  assert.equal(seen[0].model, '@cf/black-forest-labs/flux-1-schnell');
  assert.equal(seen[0].input.prompt, 'Beach festival at sunset');
  const img = await call(e, 'sam@example.com', 'GET', url);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
});

test('AI image: clear messages when switched off, failing or misused', async () => {
  const off = await env();
  const r1 = await call(off, 'huw@example.com', 'POST', '/api/ai/image', {prompt: 'x y z'});
  assert.equal(r1.status, 503);
  assert.match(await r1.text(), /not switched on/);
  const broken = await env({AI: {run: async () => { throw Error('capacity'); }}});
  assert.equal((await call(broken, 'huw@example.com', 'POST', '/api/ai/image', {prompt: 'a stage'})).status, 502);
  const ok = await env({AI: {run: async () => ({image: JPEG.toString('base64')})}});
  assert.equal((await call(ok, 'huw@example.com', 'POST', '/api/ai/image', {prompt: ''})).status, 400);
  assert.equal((await call(ok, 'huw@example.com', 'POST', '/api/ai/image', {prompt: 'x'.repeat(2000)})).status, 400);
  assert.equal((await call(ok, 'sam@example.com', 'POST', '/api/ai/image', {prompt: 'a stage'})).status, 403, 'crew cannot generate');
});

test('plan attachments: documents allowed on plans, served as downloads; not allowed as logos', async () => {
  const e = await env();
  const pdf = new TextEncoder().encode('%PDF-1.4 fake');
  const r = await call(e, 'huw@example.com', 'POST', '/api/files?kind=plan', pdf, 'application/pdf');
  assert.equal(r.status, 200);
  const {url} = await r.json();
  assert.match(url, /^\/files\/plan\/[0-9a-f]{64}\.pdf$/);
  const got = await call(e, 'huw@example.com', 'GET', url);
  assert.equal(got.headers.get('content-disposition'), 'attachment');
  assert.equal((await call(e, 'huw@example.com', 'POST', '/api/files?kind=branding', pdf, 'application/pdf')).status, 415);
  assert.equal((await call(e, 'huw@example.com', 'POST', '/api/files?kind=plan', '<html>', 'text/html')).status, 415);
  assert.equal((await call(e, 'huw@example.com', 'POST', '/api/files?kind=__proto__', pdf, 'application/pdf')).status, 400);
});

test('owner page loads the planner and sends only its origin as referrer', async () => {
  const e = await env();
  const r = await call(e, 'huw@example.com', 'GET', '/');
  assert.equal(r.headers.get('referrer-policy'), 'strict-origin');
  const html = await r.text();
  for (const f of ['planner-template.js', 'planner.js', 'sitemap.js', 'creative.js']) assert.match(html, new RegExp('/app/' + f));
});

test('with no static assets binding, app files come from the bundle, still behind sign-in', async () => {
  const e = await env({ASSETS: undefined});
  const r = await call(e, 'huw@example.com', 'GET', '/app/planner-compliance.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(await r.text(), /function planCompliance/);
  const logo = await call(e, 'huw@example.com', 'GET', '/logo.png');
  assert.equal(logo.headers.get('content-type'), 'image/png');
  assert.equal((await call(e, 'huw@example.com', 'GET', '/app/nope.js')).status, 404);
  assert.equal((await worker.fetch(new Request(O + '/app/core.js'), e)).status, 403);
});
