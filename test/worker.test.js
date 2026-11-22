import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createSign} from 'node:crypto';
import {makeD1, makeR2, sampleState} from './fakes.js';
import worker from '../worker.js';

const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const jwk = {...publicKey.export({format: 'jwk'}), kid: 'k1', alg: 'RS256'};
const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const ENV = {ACCESS_TEAM: 'hdevents', ACCESS_AUD: 'aud123', OWNER_EMAIL: 'Huw@Example.com'};
function token(email) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64({alg: 'RS256', kid: 'k1'}) + '.' + b64({iss: 'https://hdevents.cloudflareaccess.com', aud: ['aud123'], exp: now + 600, sub: 'u', email});
  return body + '.' + createSign('RSA-SHA256').update(body).sign(privateKey).toString('base64url');
}
const realFetch = globalThis.fetch;
globalThis.fetch = async url => String(url).endsWith('/cdn-cgi/access/certs') ? new Response(JSON.stringify({keys: [jwk]})) : realFetch(url);

const ORIGIN = 'https://hq.example';
function call(env, email, method, path, body) {
  const headers = {'Cf-Access-Jwt-Assertion': token(email)};
  if (body !== undefined) { headers['content-type'] = 'application/json'; headers.origin = ORIGIN; }
  return worker.fetch(new Request(ORIGIN + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)}), env);
}
const fresh = () => ({...ENV, DB: makeD1(), BACKUPS: makeR2()});

test('owner save goes through the safety layer and appears in history', async () => {
  const env = fresh();
  const r = await call(env, 'huw@example.com', 'PUT', '/api/workspace', {revision: 0, state: sampleState()});
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {revision: 1});
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const versions = await (await call(env, 'huw@example.com', 'GET', '/api/safety/versions')).json();
  assert.equal(versions.length, 1);
  const audit = await (await call(env, 'huw@example.com', 'GET', '/api/safety/audit')).json();
  assert.equal(audit[0].email, 'huw@example.com');
});

test('stale save still returns 409 as before', async () => {
  const env = fresh();
  await call(env, 'huw@example.com', 'PUT', '/api/workspace', {revision: 0, state: sampleState()});
  const r = await call(env, 'huw@example.com', 'PUT', '/api/workspace', {revision: 0, state: sampleState()});
  assert.equal(r.status, 409);
});

test('oversized and invalid saves are rejected as before', async () => {
  const env = fresh();
  const big = sampleState(); big.notes = 'x'.repeat(1900000);
  assert.equal((await call(env, 'huw@example.com', 'PUT', '/api/workspace', {revision: 0, state: big})).status, 413);
  const bad = sampleState(); bad.jobs[0].kit[0].qty = 10;
  assert.equal((await call(env, 'huw@example.com', 'PUT', '/api/workspace', {revision: 0, state: bad})).status, 422);
});

test('staff cannot read history, back up or restore', async () => {
  const env = fresh();
  for (const [m, p, b] of [['GET', '/api/safety/status'], ['GET', '/api/safety/versions'], ['GET', '/api/safety/audit'], ['GET', '/api/safety/backups'], ['GET', '/api/safety/download?key=daily/2026-11-22.json'], ['POST', '/api/safety/backup-now', {}], ['POST', '/api/safety/restore', {versionId: 1}]])
    assert.equal((await call(env, 'sam@example.com', m, p, b)).status, 403, p);
});

test('owner writes from another site are refused', async () => {
  const env = fresh();
  const r = await worker.fetch(new Request(ORIGIN + '/api/safety/backup-now', {method: 'POST', headers: {'Cf-Access-Jwt-Assertion': token('huw@example.com'), 'content-type': 'application/json', origin: 'https://evil.example'}, body: '{}'}), env);
  assert.equal(r.status, 403);
});

test('no valid Access token means no access', async () => {
  const env = fresh();
  const r = await worker.fetch(new Request(ORIGIN + '/api/safety/status'), env);
  assert.equal(r.status, 403);
});

test('back up now, list, download and restore through the API', async () => {
  const env = fresh();
  await call(env, 'huw@example.com', 'PUT', '/api/workspace', {revision: 0, state: sampleState()});
  const b = await call(env, 'huw@example.com', 'POST', '/api/safety/backup-now', {});
  assert.equal(b.status, 200);
  const {key} = await b.json();
  assert.match(key, /^manual\//);
  const list = await (await call(env, 'huw@example.com', 'GET', '/api/safety/backups')).json();
  assert.equal(list[0].key, key);
  const dl = await call(env, 'huw@example.com', 'GET', '/api/safety/download?key=' + encodeURIComponent(key));
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  assert.equal((await dl.json()).data.jobs[0].title, 'Summer Fete');
  const st = await (await call(env, 'huw@example.com', 'GET', '/api/safety/status')).json();
  assert.equal(st.healthy, true);
  const r = await call(env, 'huw@example.com', 'POST', '/api/safety/restore', {backupKey: key});
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {revision: 2});
});

test('scheduled run writes the daily backup', async () => {
  const env = fresh();
  const waits = [];
  await worker.scheduled({scheduledTime: Date.parse('2026-11-22T02:17:00Z')}, env, {waitUntil: p => waits.push(p)});
  await Promise.all(waits);
  assert.ok(env.BACKUPS.store.has('daily/2026-11-22.json'));
});

test('owner page renders with the safety panel; crew page still shows only assigned jobs', async () => {
  const env = fresh();
  await call(env, 'huw@example.com', 'PUT', '/api/workspace', {revision: 0, state: sampleState()});
  const owner = await (await call(env, 'huw@example.com', 'GET', '/')).text();
  assert.match(owner, /History &amp; backups/);
  assert.match(owner, /"revision":1/);
  const crew = await (await call(env, 'sam@example.com', 'GET', '/')).text();
  assert.match(crew, /Summer Fete/);
  assert.doesNotMatch(crew, /History/);
  assert.equal((await call(env, 'stranger@example.com', 'GET', '/')).status, 403);
});
