import test from 'node:test';
import assert from 'node:assert/strict';
import {makeD1, makeR2} from './fakes.js';
import {connectRedirect, finishConnect, googleStatus, saveToDrive, disconnect} from '../src/google.js';

// A fake Google: token endpoint, Drive folders and uploads.
const calls = [];
let nextId = 1;
const files = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({url, method: init.method || 'GET'});
  const ok = (v) => new Response(JSON.stringify(v), {status: 200});
  if (url === 'https://oauth2.googleapis.com/token') {
    const b = new URLSearchParams(init.body);
    if (b.get('grant_type') === 'authorization_code') return ok({access_token: 'a1', refresh_token: 'r-secret', id_token: 'x.' + Buffer.from(JSON.stringify({email: 'huw@hd-events.co.uk'})).toString('base64url') + '.y'});
    assert.equal(b.get('refresh_token'), 'r-secret');
    return ok({access_token: 'a2'});
  }
  if (url.startsWith('https://oauth2.googleapis.com/revoke')) return ok({});
  const m = url.match(/^https:\/\/www\.googleapis\.com(\/upload)?\/drive\/v3\/files(?:\/([^?]+))?/);
  if (m) {
    assert.equal(init.headers.authorization, 'Bearer a2');
    if (m[2] && (init.method || 'GET') === 'GET') return files.has(m[2]) ? ok({id: m[2], trashed: false}) : new Response('{}', {status: 404});
    if (m[2] && init.method === 'PATCH') { files.get(m[2]).updates++; return ok({id: m[2], webViewLink: 'https://docs/' + m[2]}); }
    let meta;
    if (m[1]) { const text = new TextDecoder().decode(init.body); meta = JSON.parse(text.split('\r\n\r\n')[1].split('\r\n')[0]); }
    else meta = JSON.parse(init.body);
    const id = 'f' + nextId++;
    files.set(id, {...meta, updates: 0});
    return ok({id, webViewLink: 'https://docs/' + id});
  }
  return realFetch(url, init);
};

const env = {DB: makeD1(), FILES: makeR2(), GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'shh'};
const url = new URL('https://hq.example/api/google/connect');

test('connect sends the owner to Google with drive.file only, and remembers a state cookie', async () => {
  const r = connectRedirect(env, url);
  const to = new URL(r.headers.get('location'));
  assert.equal(to.host, 'accounts.google.com');
  assert.equal(to.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file openid email');
  assert.equal(to.searchParams.get('redirect_uri'), 'https://hq.example/api/google/callback');
  assert.match(r.headers.get('set-cookie'), /hq_google_state=[0-9a-f]{32}; .*HttpOnly/);
});

test('a callback without the matching state is refused', async () => {
  const r = await finishConnect(new Request('https://hq.example/api/google/callback?code=c&state=' + 'a'.repeat(32)), env, new URL('https://hq.example/api/google/callback?code=c&state=' + 'a'.repeat(32)), 'huw');
  assert.match(r.headers.get('location'), /google=expired/);
  assert.equal((await googleStatus(env)).connected, false);
});

test('the callback stores the refresh token encrypted, never in plain text', async () => {
  const state = 'b'.repeat(32), cb = new URL('https://hq.example/api/google/callback?code=c&state=' + state);
  const r = await finishConnect(new Request(cb, {headers: {cookie: 'hq_google_state=' + state}}), env, cb, 'huw');
  assert.match(r.headers.get('location'), /google=connected/);
  const row = await env.DB.prepare("SELECT data FROM integrations WHERE name='google'").first();
  assert.ok(!row.data.includes('r-secret'));
  const s = await googleStatus(env);
  assert.equal(s.connected, true);
  assert.equal(s.account, 'huw@hd-events.co.uk');
});

test('saving makes HD Events HQ › year › event › sub-folder, converts to a Google Doc, and updates in place next time', async () => {
  const item = {ref: 'plan:42', title: 'Beach Fest', year: '2027', sub: 'Safety documents', name: 'Risk assessment (draft)', as: 'doc', html: '<p>RA</p>'};
  const a = await saveToDrive(env, item);
  const names = [...files.values()].map((f) => f.name);
  assert.deepEqual(names, ['HD Events HQ', '2027', 'Beach Fest', 'Safety documents', 'Risk assessment (draft)']);
  assert.equal(files.get(a.id).mimeType, 'application/vnd.google-apps.document');
  const b = await saveToDrive(env, {...item, html: '<p>RA v2</p>'});
  assert.equal(b.id, a.id);
  assert.equal(b.updated, true);
  assert.equal(files.size, 5);
  const sheet = await saveToDrive(env, {...item, sub: 'Checklist & suppliers', name: 'Checklist', as: 'sheet', csv: 'a,b\n1,2', html: undefined});
  assert.equal(files.get(sheet.id).mimeType, 'application/vnd.google-apps.spreadsheet');
  assert.equal(files.size, 7); // one new sub-folder + the sheet; event folders reused
});

test('stored files are copied from HQ file storage; unknown folders, refs and paths are refused', async () => {
  const key = 'plan/' + 'c'.repeat(64) + '.pdf';
  await env.FILES.put(key, new Uint8Array([37, 80, 68, 70]), {httpMetadata: {contentType: 'application/pdf'}});
  const r = await saveToDrive(env, {ref: 'plan:42', title: 'Beach Fest', year: '2027', sub: 'Certificates & uploads', name: 'cert.pdf', as: 'file', fileUrl: '/files/' + key});
  assert.ok(r.id);
  await assert.rejects(saveToDrive(env, {ref: 'plan:42', title: 'x', sub: 'Elsewhere', name: 'n', as: 'doc', html: 'x'}), /Unknown folder/);
  await assert.rejects(saveToDrive(env, {ref: 'evil', title: 'x', sub: 'Safety documents', name: 'n', as: 'doc', html: 'x'}), /Unknown event/);
  await assert.rejects(saveToDrive(env, {ref: 'plan:1', title: 'x', sub: 'Safety documents', name: 'n', as: 'file', fileUrl: '/files/../secret'}), /Unknown file/);
});

test('disconnect revokes and forgets the connection', async () => {
  await disconnect(env);
  assert.ok(calls.some((c) => c.url.startsWith('https://oauth2.googleapis.com/revoke')));
  assert.equal((await googleStatus(env)).connected, false);
  await assert.rejects(saveToDrive(env, {ref: 'plan:42', title: 'Beach Fest', sub: 'Safety documents', name: 'n', as: 'doc', html: 'x'}), /not connected/);
});
