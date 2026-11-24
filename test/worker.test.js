import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createSign} from 'node:crypto';
import {makeD1, makeR2, sampleState, seedLegacy, assets} from './fakes.js';
import worker from '../src/worker.js';

const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const jwk = {...publicKey.export({format: 'jwk'}), kid: 'k1', alg: 'RS256'};
const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const ENV = {ACCESS_TEAM: 'hdevents', ACCESS_AUD: 'aud123', OWNER_EMAIL: 'Huw@Example.com'};
export function token(email) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64({alg: 'RS256', kid: 'k1'}) + '.' + b64({iss: 'https://hdevents.cloudflareaccess.com', aud: ['aud123'], exp: now + 600, sub: 'u', email});
  return body + '.' + createSign('RSA-SHA256').update(body).sign(privateKey).toString('base64url');
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => String(url).endsWith('/cdn-cgi/access/certs') ? new Response(JSON.stringify({keys: [jwk]})) : realFetch(url, init);

const ORIGIN = 'https://hq.example';
const OWNER = 'huw@example.com';
function call(env, email, method, path, body, type = 'application/json') {
  const headers = {'Cf-Access-Jwt-Assertion': token(email)};
  if (body !== undefined) { headers['content-type'] = type; headers.origin = ORIGIN; }
  return worker.fetch(new Request(ORIGIN + path, {method, headers, body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body)}), env);
}
function fresh() { const env = {...ENV, DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2(), ASSETS: assets}; seedLegacy(env, sampleState()); return env; }
async function migrated() { const env = fresh(); const r = await call(env, OWNER, 'POST', '/api/migrate', {}); assert.equal(r.status, 200, await r.clone().text()); return env; }

test('owner sees the upgrade screen until the move to tables, then the app', async () => {
  const env = fresh();
  const page = await (await call(env, OWNER, 'GET', '/')).text();
  assert.match(page, /One-off storage upgrade/);
  assert.match(page, /Upgrade now/);
  assert.equal((await call(env, OWNER, 'POST', '/api/changes', {changes: []})).status, 409, 'no saves before the upgrade');
  const r = await (await call(env, OWNER, 'POST', '/api/migrate', {})).json();
  assert.equal(r.ok, true);
  assert.deepEqual(r.before, r.after);
  const app = await (await call(env, OWNER, 'GET', '/')).text();
  assert.match(app, /<script id="boot" type="application\/json">\{"state":/);
  assert.match(app, /src="\/app\/core.js"/);
  assert.ok(app.length < 10000, 'owner page is now small: ' + app.length);
});

test('upgrade screen says backups must be set up first', async () => {
  const env = fresh(); delete env.BACKUPS;
  assert.match(await (await call(env, OWNER, 'GET', '/')).text(), /Backups must be switched on first/);
});

test('crew page works before and after the upgrade', async () => {
  const env = fresh();
  assert.match(await (await call(env, 'sam@example.com', 'GET', '/')).text(), /Summer Fete/);
  await call(env, OWNER, 'POST', '/api/migrate', {});
  const crew = await (await call(env, 'sam@example.com', 'GET', '/')).text();
  assert.match(crew, /Summer Fete/);
  assert.match(crew, /src="\/logo.png"/);
  assert.equal((await call(env, 'stranger@example.com', 'GET', '/')).status, 403);
});

test('per-record save through the API', async () => {
  const env = await migrated();
  const job = {...sampleState().jobs[0], venue: 'Main Field'};
  const r = await call(env, OWNER, 'POST', '/api/changes', {changes: [{collection: 'jobs', id: 30, op: 'put', version: 1, data: job}]});
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {versions: [{collection: 'jobs', id: 30, version: 2}]});
  const stale = await call(env, OWNER, 'POST', '/api/changes', {changes: [{collection: 'jobs', id: 30, op: 'put', version: 1, data: job}]});
  assert.equal(stale.status, 409);
  const bad = structuredClone(job); bad.kit[0].qty = 40;
  assert.equal((await call(env, OWNER, 'POST', '/api/changes', {changes: [{collection: 'jobs', id: 30, op: 'put', version: 2, data: bad}]})).status, 422);
});

test('old cached pages get a clear message instead of overwriting data', async () => {
  const env = await migrated();
  const r = await call(env, OWNER, 'PUT', '/api/workspace', {revision: 7, state: sampleState()});
  assert.equal(r.status, 410);
});

test('staff cannot use any owner API', async () => {
  const env = await migrated();
  for (const [m, p, b] of [['POST', '/api/changes', {changes: []}], ['POST', '/api/migrate', {}], ['GET', '/api/safety/status'], ['GET', '/api/safety/audit'], ['GET', '/api/safety/backups'], ['POST', '/api/safety/undo', {saveId: 1}], ['POST', '/api/safety/import', {state: {}}], ['POST', '/api/safety/backup-now', {}]])
    assert.equal((await call(env, 'sam@example.com', m, p, b)).status, 403, p);
  assert.equal((await call(env, 'sam@example.com', 'POST', '/api/files?kind=branding', new Uint8Array([1]), 'image/png')).status, 403);
});

test('writes from another site and requests without sign-in are refused', async () => {
  const env = await migrated();
  const r = await worker.fetch(new Request(ORIGIN + '/api/changes', {method: 'POST', headers: {'Cf-Access-Jwt-Assertion': token(OWNER), 'content-type': 'application/json', origin: 'https://evil.example'}, body: '{"changes":[]}'}), env);
  assert.equal(r.status, 403);
  assert.equal((await worker.fetch(new Request(ORIGIN + '/app/core.js'), env)).status, 403);
  assert.equal((await worker.fetch(new Request(ORIGIN + '/files/branding/' + 'a'.repeat(64) + '.png'), env)).status, 403);
});

test('image upload goes to file storage and is served back safely', async () => {
  const env = await migrated();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const r = await call(env, OWNER, 'POST', '/api/files?kind=equipment', png, 'image/png');
  assert.equal(r.status, 200);
  const {url} = await r.json();
  assert.match(url, /^\/files\/equipment\/[0-9a-f]{64}\.png$/);
  const got = await call(env, 'sam@example.com', 'GET', url);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.match(got.headers.get('content-security-policy'), /sandbox/);
  assert.deepEqual(new Uint8Array(await got.arrayBuffer()), png);
  assert.equal((await call(env, OWNER, 'POST', '/api/files?kind=equipment', new Uint8Array([1]), 'text/html')).status, 415, 'non-image content type refused');
  assert.equal((await call(env, OWNER, 'POST', '/api/files?kind=../x', png, 'image/png')).status, 400);
  assert.equal((await call(env, OWNER, 'GET', '/files/../secret')).status, 404);
});

test('app files and logo are served to signed-in users', async () => {
  const env = await migrated();
  const js = await call(env, 'sam@example.com', 'GET', '/app/core.js');
  assert.equal(js.status, 200);
  assert.match(await js.text(), /function render/);
  assert.equal((await call(env, OWNER, 'GET', '/logo.png')).headers.get('content-type'), 'image/png');
});

test('back up now, import, undo and restore through the API', async () => {
  const env = await migrated();
  const b = await (await call(env, OWNER, 'POST', '/api/safety/backup-now', {})).json();
  assert.equal(b.ok, true);
  const next = sampleState(); next.clients.push({id: 21, name: 'Imported Co'});
  const imp = await call(env, OWNER, 'POST', '/api/safety/import', {state: next});
  assert.equal(imp.status, 200);
  const {saveId} = await imp.json();
  assert.match(await (await call(env, OWNER, 'GET', '/')).text(), /Imported Co/);
  assert.equal((await call(env, OWNER, 'POST', '/api/safety/undo', {saveId})).status, 200);
  assert.doesNotMatch(await (await call(env, OWNER, 'GET', '/')).text(), /Imported Co/);
  // Delete a contact, then restore last backup: the contact comes back.
  assert.equal((await call(env, OWNER, 'POST', '/api/changes', {changes: [{collection: 'clients', id: 20, op: 'delete', version: 1}]})).status, 200);
  const rest = await call(env, OWNER, 'POST', '/api/safety/restore', {backupKey: b.key});
  assert.equal(rest.status, 200);
  assert.equal((await rest.json()).records, 1);
  assert.match(await (await call(env, OWNER, 'GET', '/')).text(), /Village Hall/);
  const audit = await (await call(env, OWNER, 'GET', '/api/safety/audit')).json();
  assert.deepEqual(audit.map(a => a.action), ['restore', 'save', 'restore', 'restore', 'backup', 'migrate', 'backup']);
  assert.equal(audit[0].summary.restoredFrom.backupKey, b.key);
  assert.equal(audit[2].summary.undoTo, saveId);
  assert.equal(audit[3].summary.imported, true);
  const st = await (await call(env, OWNER, 'GET', '/api/safety/status')).json();
  assert.equal(st.healthy, true);
});

test('scheduled run writes the daily backup', async () => {
  const env = await migrated();
  const waits = [];
  await worker.scheduled({scheduledTime: Date.parse('2026-11-22T02:17:00Z')}, env, {waitUntil: p => waits.push(p)});
  await Promise.all(waits);
  assert.ok(env.BACKUPS.store.has('daily/2026-11-22.json'));
});
