import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createSign} from 'node:crypto';
import {makeD1, makeR2, sampleState, seedLegacy, assets} from './fakes.js';
import {loadState} from '../src/store.js';
import worker from '../src/worker.js';

const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const jwk = {...publicKey.export({format: 'jwk'}), kid: 'c1', alg: 'RS256'};
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const TEAM = 'crewtest';
function token(email) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64({alg: 'RS256', kid: 'c1'}) + '.' + b64({iss: `https://${TEAM}.cloudflareaccess.com`, aud: ['aud'], exp: now + 600, sub: 'u', email});
  return body + '.' + createSign('RSA-SHA256').update(body).sign(privateKey).toString('base64url');
}
const prev = globalThis.fetch;
globalThis.fetch = async (url, init) => (String(url) === `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs` ? new Response(JSON.stringify({keys: [jwk]})) : prev(url, init));
const O = 'https://hq.example', OWNER = 'huw@example.com', SAM = 'sam@example.com';
const post = (env, email, path, form) => worker.fetch(new Request(O + path, {method: 'POST', headers: {'Cf-Access-Jwt-Assertion': token(email), origin: O}, body: form}), env);
const form = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) for (const x of [].concat(v)) f.append(k, x); return f; };

async function setup() {
  const env = {ACCESS_TEAM: TEAM, ACCESS_AUD: 'aud', OWNER_EMAIL: OWNER, DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2(), ASSETS: assets};
  const s = sampleState(); // job 30 is assigned to Sam (staff 10)
  s.jobs.push({id: 31, title: 'Not Sam', booking: 'Draft', start: '2026-07-05', end: '2026-07-05', staffId: 99, kit: []});
  seedLegacy(env, s);
  const r = await worker.fetch(new Request(O + '/api/migrate', {method: 'POST', headers: {'Cf-Access-Jwt-Assertion': token(OWNER), origin: O, 'content-type': 'application/json'}, body: '{}'}), env);
  assert.equal(r.status, 200);
  return env;
}
const reports = async (env) => (await loadState(env)).state.jobReports;

test('crew can report damage and write a debrief on their own jobs', async () => {
  const env = await setup();
  let r = await post(env, SAM, '/api/crew/damage', form({jobId: 30, item: 'Nexo PS10', text: 'Grille dented'}));
  assert.equal(r.status, 303);
  assert.match(r.headers.get('location'), /Damage%20report%20saved.*#job-30/);
  r = await post(env, SAM, '/api/crew/debrief', form({jobId: 30, text: 'Client happy; needed two extra lights.'}));
  assert.equal(r.status, 303);
  const list = await reports(env);
  assert.deepEqual(list.map((x) => [x.kind, x.jobId, x.by, x.item || '', x.text]), [['damage', 30, SAM, 'Nexo PS10', 'Grille dented'], ['debrief', 30, SAM, '', 'Client happy; needed two extra lights.']]);
  // Shown back to Sam on the crew page.
  const page = await (await worker.fetch(new Request(O + '/?msg=Saved', {headers: {'Cf-Access-Jwt-Assertion': token(SAM)}}), env)).text();
  assert.match(page, /Damage: Nexo PS10/);
  assert.match(page, /class="msg"[^>]*>Saved/);
});

test('crew cannot report on other jobs, and others cannot use the crew forms', async () => {
  const env = await setup();
  let r = await post(env, SAM, '/api/crew/debrief', form({jobId: 31, text: 'Sneaky'}));
  assert.match(decodeURIComponent(r.headers.get('location')), /only report on jobs you are assigned to/);
  r = await post(env, SAM, '/api/crew/damage', form({jobId: 30, item: 'Something not on the job', text: 'x'}));
  assert.match(decodeURIComponent(r.headers.get('location')), /Choose an item from this job/);
  assert.equal((await post(env, 'stranger@example.com', '/api/crew/debrief', form({jobId: 30, text: 'x'}))).status, 403);
  // Cross-site posts are refused.
  const x = await worker.fetch(new Request(O + '/api/crew/debrief', {method: 'POST', headers: {'Cf-Access-Jwt-Assertion': token(SAM), origin: 'https://evil.example'}, body: form({jobId: 30, text: 'x'})}), env);
  assert.equal(x.status, 403);
  assert.deepEqual(await reports(env), []);
});

test('crew upload receipts and venue photos to the job', async () => {
  const env = await setup();
  const jpg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'receipt.jpg', {type: 'image/jpeg'});
  const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9])], 'stage.png', {type: 'image/png'});
  let r = await post(env, SAM, '/api/crew/photo', form({jobId: 30, label: 'Receipt', note: 'Fuel', photo: [jpg, png]}));
  assert.equal(r.status, 303);
  assert.match(r.headers.get('location'), /2%20photos%20uploaded/);
  const list = await reports(env);
  assert.deepEqual(list.map((x) => [x.kind, x.label, x.name, x.text]), [['photo', 'Receipt', 'receipt.jpg', 'Fuel'], ['photo', 'Receipt', 'stage.png', 'Fuel']]);
  assert.match(list[0].url, /^\/files\/crew\/[0-9a-f]{64}\.jpg$/);
  r = await post(env, SAM, '/api/crew/photo', form({jobId: 30, label: 'Selfie', photo: jpg}));
  assert.match(decodeURIComponent(r.headers.get('location')), /Choose Receipt or Venue photo/);
  const pdf = new File(['%PDF'], 'x.pdf', {type: 'application/pdf'});
  r = await post(env, SAM, '/api/crew/photo', form({jobId: 30, label: 'Receipt', photo: pdf}));
  assert.match(decodeURIComponent(r.headers.get('location')), /Use a PNG, JPEG/);
});
