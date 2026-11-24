import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createSign} from 'node:crypto';
import {makeD1, makeR2, sampleState, seedLegacy, assets} from './fakes.js';
import {fingerprint} from '../public/app/stock.js';
import {policyBody} from '../src/accesssync.js';
import worker from '../src/worker.js';

const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const jwk = {...publicKey.export({format: 'jwk'}), kid: 'r1', alg: 'RS256'};
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const TEAM = 'rolestest';
function token(email) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64({alg: 'RS256', kid: 'r1'}) + '.' + b64({iss: `https://${TEAM}.cloudflareaccess.com`, aud: ['aud'], exp: now + 600, sub: 'u', email});
  return body + '.' + createSign('RSA-SHA256').update(body).sign(privateKey).toString('base64url');
}
const certFetch = globalThis.fetch;
const sent = [];
globalThis.fetch = async (url, init) => {
  if (String(url) === `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`) return new Response(JSON.stringify({keys: [jwk]}));
  if (String(url).startsWith('https://api.cloudflare.com/')) { sent.push({url: String(url), init}); return new Response('{"success":true}'); }
  return certFetch(url, init);
};
const O = 'https://hq.example', OWNER = 'huw@example.com', JULIAN = 'julian@partner.com';
const call = (env, email, method, path, body) => worker.fetch(new Request(O + path, {method, headers: {'Cf-Access-Jwt-Assertion': token(email), ...(body !== undefined ? {'content-type': 'application/json', origin: O} : {})}, body: body === undefined ? undefined : JSON.stringify(body)}), env);
const boot = async (r) => JSON.parse((await r.text()).match(/<script id="boot" type="application\/json">(.*?)<\/script>/s)[1]);

async function setup(extra = {}) {
  const env = {ACCESS_TEAM: TEAM, ACCESS_AUD: 'aud', OWNER_EMAIL: OWNER, DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2(), ASSETS: assets, ...extra};
  const s = sampleState();
  s.inventory[0].price = 45;
  s.jobs[0].kit[0].price = 45;
  s.jobs[0].discount = 10;
  s.crewInvites.push({id: 40, jobId: 30, staffId: 10, fee: 150});
  const content = 'Risk assessment text';
  s.plans.push({id: 50, jobId: 30, title: 'Summer Fete plan', stages: [{key: 'risk', name: 'Risk', items: [
    {id: 51, title: 'Event risk assessment', status: 'done', doc: {kind: 'ra', content, status: 'approved', approval: {by: 'Huw Jenkins', at: '2026-11-01T10:00:00Z', hash: fingerprint(content)}}},
    {id: 52, title: 'Fire risk assessment', status: 'todo', doc: {kind: 'fra', content: 'Draft', status: 'draft'}},
  ]}]});
  seedLegacy(env, s);
  assert.equal((await call(env, OWNER, 'POST', '/api/migrate', {})).status, 200);
  return env;
}
async function addJulian(env, sections) {
  const r = await call(env, OWNER, 'POST', '/api/changes', {changes: [{collection: 'settings', id: 'access', op: 'put', version: 0, data: {members: [{name: 'Julian', email: JULIAN, sections}]}}]});
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
}
const versionsOf = async (env, email) => (await boot(await call(env, email, 'GET', '/'))).versions;

test('people who have not been invited are refused', async () => {
  const env = await setup();
  const r = await call(env, 'stranger@example.com', 'GET', '/');
  assert.equal(r.status, 403);
  assert.match(await r.text(), /not been invited/);
  assert.equal((await call(env, 'stranger@example.com', 'POST', '/api/changes', {changes: []})).status, 403);
});

test('a planner-only partner sees plans and job outlines, never money or other areas', async () => {
  const env = await setup();
  await addJulian(env, ['overview', 'planner']);
  const b = await boot(await call(env, JULIAN, 'GET', '/'));
  assert.equal(b.me.owner, false);
  assert.equal(b.me.money, false);
  assert.equal(b.state.plans.length, 1);
  assert.deepEqual(b.state.jobs[0], {id: 30, title: 'Summer Fete', start: '2026-07-01T08:00', end: '2026-07-02T18:00', venue: 'Green', booking: 'Reserved'});
  for (const c of ['inventory', 'clients', 'crewInvites', 'tasks', 'quotes']) assert.deepEqual(b.state[c], [], c);
  assert.equal(b.state.access, undefined, 'the access list stays with the owner');
  const page = JSON.stringify(b);
  assert.doesNotMatch(page, /"price"|"discount"|"fee"/);
});

test('without money, prices are hidden but kept when the partner saves a job', async () => {
  const env = await setup();
  await addJulian(env, ['jobs']);
  const b = await boot(await call(env, JULIAN, 'GET', '/'));
  const job = b.state.jobs[0];
  assert.equal(job.discount, undefined);
  assert.equal(job.kit[0].price, undefined);
  assert.equal(b.state.inventory[0].price, undefined);
  assert.equal(b.state.crewInvites[0].fee, undefined);
  // Julian renames the job and adds a line; trying to set a price or discount is ignored.
  const edited = {...job, title: 'Summer Fete 2026', discount: 0, kit: [...job.kit, {item: 'XLR 10m', qty: 4, price: 1}]};
  const r = await call(env, JULIAN, 'POST', '/api/changes', {changes: [{collection: 'jobs', id: 30, op: 'put', version: b.versions.jobs[30], data: edited}]});
  assert.equal(r.status, 200, await r.clone().text());
  const full = (await boot(await call(env, OWNER, 'GET', '/'))).state.jobs[0];
  assert.equal(full.title, 'Summer Fete 2026');
  assert.equal(full.discount, 10);
  assert.equal(full.kit[0].price, 45);
  assert.equal(full.kit[1].price, undefined, 'new line takes the list price, which XLR does not have');
});

test('the server refuses changes outside a member\'s areas', async () => {
  const env = await setup();
  await addJulian(env, ['overview', 'planner']);
  const v = await versionsOf(env, OWNER);
  const tries = [
    {collection: 'jobs', id: 30, op: 'delete', version: v.jobs[30]},
    {collection: 'inventory', id: 99, op: 'put', version: 0, data: {id: 99, name: 'Sneaky', qty: 1, service: 0}},
    {collection: 'settings', id: 'access', op: 'put', version: v.settings.access, data: {members: []}},
    {collection: 'settings', id: 'company', op: 'put', version: 0, data: {name: 'Not HD'}},
  ];
  for (const ch of tries) assert.equal((await call(env, JULIAN, 'POST', '/api/changes', {changes: [ch]})).status, 403, ch.collection);
  for (const p of ['/api/safety/status', '/api/safety/audit', '/api/access/status']) assert.equal((await call(env, JULIAN, 'GET', p)).status, 403, p);
  assert.equal((await call(env, JULIAN, 'POST', '/api/safety/undo', {saveId: 1})).status, 403);
});

test('only the owner can approve or change an approved safety document', async () => {
  const env = await setup();
  await addJulian(env, ['planner']);
  const b = await boot(await call(env, JULIAN, 'GET', '/'));
  const plan = b.state.plans[0], ver = b.versions.plans[50];
  const put = (data) => call(env, JULIAN, 'POST', '/api/changes', {changes: [{collection: 'plans', id: 50, op: 'put', version: ver, data}]});
  // Approving the fire risk assessment himself:
  const approve = structuredClone(plan);
  const fra = approve.stages[0].items[1];
  fra.doc = {...fra.doc, status: 'approved', approval: {by: 'Julian', at: new Date().toISOString(), hash: fingerprint('Draft')}};
  assert.equal((await put(approve)).status, 403);
  // Withdrawing the approved one:
  const withdraw = structuredClone(plan);
  withdraw.stages[0].items[0].doc = {kind: 'ra', content: 'Changed', status: 'draft'};
  assert.equal((await put(withdraw)).status, 403);
  // Editing a draft and ticking items is fine:
  const ok = structuredClone(plan);
  ok.stages[0].items[1].doc.content = 'Better draft';
  ok.stages[0].items[1].status = 'doing';
  assert.equal((await put(ok)).status, 200);
});

test('everything except money: wide access, but still no prices', async () => {
  const env = await setup();
  await addJulian(env, ['overview', 'planner', 'jobs', 'tasks', 'kit', 'people']);
  const b = await boot(await call(env, JULIAN, 'GET', '/'));
  assert.equal(b.state.inventory.length, 2);
  assert.equal(b.state.jobs[0].kit.length, 1);
  assert.doesNotMatch(JSON.stringify(b.state), /"price"|"discount"|"fee"/);
  await addJulianAgain(env, ['overview', 'planner', 'jobs', 'tasks', 'kit', 'people', 'money']);
  const m = await boot(await call(env, JULIAN, 'GET', '/'));
  assert.equal(m.state.jobs[0].discount, 10);
  assert.equal(m.state.crewInvites[0].fee, 150);
});
async function addJulianAgain(env, sections) {
  const v = await versionsOf(env, OWNER);
  const r = await call(env, OWNER, 'POST', '/api/changes', {changes: [{collection: 'settings', id: 'access', op: 'put', version: v.settings.access, data: {members: [{name: 'Julian', email: JULIAN, sections}]}}]});
  assert.equal(r.status, 200);
}

test('the access list is checked', async () => {
  const env = await setup();
  const bad = [{members: [{name: 'X', email: 'not-an-email', sections: []}]}, {members: [{name: 'Me', email: OWNER, sections: []}]}, {members: [{name: 'J', email: JULIAN, sections: ['everything']}]}];
  for (const data of bad) assert.equal((await call(env, OWNER, 'POST', '/api/changes', {changes: [{collection: 'settings', id: 'access', op: 'put', version: 0, data}]})).status, 422);
});

test('adding crew or team members updates the Cloudflare sign-in list when set up', async () => {
  const env = await setup({CF_ACCESS_TOKEN: 't', CF_ACCOUNT_ID: 'acc', ACCESS_APP_ID: 'app', ACCESS_POLICY_ID: 'pol'});
  sent.length = 0;
  const r = await addJulian(env, ['planner']);
  assert.equal(r.access, 'ok');
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /accounts\/acc\/access\/apps\/app\/policies\/pol$/);
  assert.deepEqual(JSON.parse(sent[0].init.body), policyBody([OWNER, JULIAN, 'sam@example.com']));
  // Not configured: the save still works and says the list needs updating.
  const env2 = await setup();
  assert.equal((await addJulian(env2, ['planner'])).access, 'not-configured');
  const st = await (await call(env2, OWNER, 'GET', '/api/access/status')).json();
  assert.deepEqual(st, {emails: [OWNER, JULIAN, 'sam@example.com'], inSync: false, automatic: false});
});
