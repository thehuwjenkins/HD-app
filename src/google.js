// Google Drive: one folder per event, holding the documents HQ produces for it.
//
// The owner connects once (OAuth, scope drive.file: the app can only see files it created itself).
// The refresh token is stored encrypted in the `integrations` table, never in the workspace state,
// so it is never sent to a browser. Saving converts HTML to a Google Doc and CSV to a Google Sheet,
// and copies uploaded files (certificates, photos) from HQ's file storage. Saving the same document
// again updates the existing Drive file instead of making a copy.
import {FILE_PATH} from './files.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email';
const ROOT_NAME = 'HD Events HQ';
const FOLDER = 'application/vnd.google-apps.folder';
const AS = {doc: 'application/vnd.google-apps.document', sheet: 'application/vnd.google-apps.spreadsheet'};
const SUBFOLDERS = ['Safety documents', 'Checklist & suppliers', 'Certificates & uploads', 'Site map & posters', 'Compliance pack', 'Job paperwork'];

const fail = (msg, status = 400) => Object.assign(Error(msg), {status});
const redirectUri = (url) => url.origin + '/api/google/callback';
export const googleConfigured = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

// ---------- Stored connection (encrypted) ----------
async function key(env) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hq-google-drive:' + env.GOOGLE_CLIENT_SECRET));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function seal(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return b64(iv) + '.' + b64(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, await key(env), new TextEncoder().encode(text)));
}
async function open(env, sealed) {
  const [iv, data] = sealed.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64(iv)}, await key(env), unb64(data)));
}
const getRow = async (env, name) => {
  const r = await env.DB.prepare('SELECT data FROM integrations WHERE name=?').bind(name).first();
  return r ? JSON.parse(r.data) : null;
};
const putRow = (env, name, data) =>
  env.DB.prepare('INSERT INTO integrations (name,data,updated_at) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(name, JSON.stringify(data), new Date().toISOString()).run();

// ---------- OAuth ----------
function randomState() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function connectRedirect(env, url) {
  if (!googleConfigured(env)) throw fail('Google is not set up yet.', 503);
  const state = randomState();
  const q = new URLSearchParams({client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(url), response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state});
  return new Response(null, {status: 302, headers: {location: 'https://accounts.google.com/o/oauth2/v2/auth?' + q, 'set-cookie': `hq_google_state=${state}; Path=/api/google; Max-Age=600; HttpOnly; Secure; SameSite=Lax`, 'cache-control': 'no-store'}});
}
async function tokenRequest(env, body) {
  const r = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...body})});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw fail('Google said: ' + (d.error_description || d.error || r.status), d.error === 'invalid_grant' ? 401 : 502);
  return d;
}
const emailFromIdToken = (t) => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch { return ''; } };
export async function finishConnect(req, env, url, by) {
  const back = (msg) => new Response(null, {status: 302, headers: {location: '/?google=' + encodeURIComponent(msg) + '#Branding', 'set-cookie': 'hq_google_state=; Path=/api/google; Max-Age=0; HttpOnly; Secure; SameSite=Lax', 'cache-control': 'no-store'}});
  if (url.searchParams.get('error')) return back('cancelled');
  const cookie = (req.headers.get('cookie') || '').match(/(?:^|;\s*)hq_google_state=([0-9a-f]{32})/)?.[1];
  if (!cookie || cookie !== url.searchParams.get('state')) return back('expired');
  const d = await tokenRequest(env, {grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: redirectUri(url)});
  if (!d.refresh_token) return back('no-refresh');
  await putRow(env, 'google', {refresh: await seal(env, d.refresh_token), account: emailFromIdToken(d.id_token || ''), connectedBy: by, connectedAt: new Date().toISOString()});
  return back('connected');
}
export async function googleStatus(env) {
  if (!googleConfigured(env)) return {configured: false, connected: false};
  const g = await getRow(env, 'google');
  return {configured: true, connected: !!g?.refresh, account: g?.account || '', connectedAt: g?.connectedAt || '', rootLink: g?.root ? folderLink(g.root) : ''};
}
export async function disconnect(env) {
  const g = await getRow(env, 'google');
  if (g?.refresh) {
    try { await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(await open(env, g.refresh)), {method: 'POST'}); } catch {}
  }
  await env.DB.prepare("DELETE FROM integrations WHERE name='google' OR name LIKE 'gfolder:%' OR name LIKE 'gfile:%'").run();
}

// ---------- Drive ----------
async function accessToken(env) {
  const g = await getRow(env, 'google');
  if (!g?.refresh) throw fail('Google Drive is not connected. Huw can connect it under Branding.', 409);
  try {
    return {token: (await tokenRequest(env, {grant_type: 'refresh_token', refresh_token: await open(env, g.refresh)})).access_token, g};
  } catch (e) {
    if (e.status === 401) throw fail('Google Drive needs reconnecting (Google ended the connection). Huw can reconnect it under Branding.', 409);
    throw e;
  }
}
const folderLink = (id) => 'https://drive.google.com/drive/folders/' + id;
async function drive(token, path, init = {}) {
  const r = await fetch('https://www.googleapis.com' + path, {...init, headers: {authorization: 'Bearer ' + token, ...(init.headers || {})}});
  if (r.status === 404) return null;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw fail('Google Drive said: ' + (d.error?.message || r.status), 502);
  return d;
}
// A folder we made before, if it still exists and isn't in the bin; otherwise a new one.
async function ensureFolder(env, token, rowName, name, parent) {
  const known = await getRow(env, rowName);
  if (known?.id) {
    const f = await drive(token, `/drive/v3/files/${known.id}?fields=id,trashed`);
    if (f && !f.trashed) return known.id;
  }
  const f = await drive(token, '/drive/v3/files?fields=id', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({name, mimeType: FOLDER, ...(parent ? {parents: [parent]} : {})})});
  await putRow(env, rowName, {id: f.id, name});
  return f.id;
}
async function eventFolder(env, token, g, ref, title, year) {
  const root = await ensureFolder(env, token, 'gfolder:root', ROOT_NAME, null);
  if (g.root !== root) await putRow(env, 'google', {...g, root});
  const yearId = await ensureFolder(env, token, 'gfolder:year:' + year, String(year), root);
  return ensureFolder(env, token, 'gfolder:' + ref, title, yearId);
}
function multipart(meta, type, bytes) {
  const boundary = 'hq' + randomState();
  const head = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`);
  const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  return {body, type: 'multipart/related; boundary=' + boundary};
}

const REF = /^(plan|job):\d{1,20}$/;
const clean = (s, max = 150) => String(s || '').replace(/[\u0000-\u001f\\/]/g, ' ').trim().slice(0, max);

// Save one item into an event's folder. item: {ref, title, year, sub, name, as: 'doc'|'sheet'|'file', html|csv|fileUrl}
export async function saveToDrive(env, item) {
  if (!REF.test(item?.ref || '')) throw fail('Unknown event');
  const title = clean(item.title) || 'Untitled event', name = clean(item.name, 200);
  const year = /^\d{4}$/.test(String(item.year)) ? String(item.year) : String(new Date().getFullYear());
  if (!name) throw fail('Each file needs a name');
  if (!SUBFOLDERS.includes(item.sub)) throw fail('Unknown folder');
  let bytes, type, meta = {name};
  if (item.as === 'doc' || item.as === 'sheet') {
    const text = item.as === 'doc' ? item.html : item.csv;
    if (typeof text !== 'string' || text.length > 3_000_000) throw fail('Document missing or too large');
    bytes = new TextEncoder().encode(text);
    type = item.as === 'doc' ? 'text/html; charset=UTF-8' : 'text/csv; charset=UTF-8';
    meta.mimeType = AS[item.as];
  } else if (item.as === 'file') {
    if (!env.FILES || !FILE_PATH.test(item.fileUrl || '')) throw fail('Unknown file');
    const obj = await env.FILES.get(item.fileUrl.slice(7));
    if (!obj) throw fail('That file is no longer in HQ storage', 404);
    bytes = new Uint8Array(await obj.arrayBuffer());
    type = obj.httpMetadata?.contentType || 'application/octet-stream';
  } else throw fail('Unknown kind of file');

  const {token, g} = await accessToken(env);
  const folder = await eventFolder(env, token, g, item.ref, title, year);
  const sub = await ensureFolder(env, token, `gfolder:${item.ref}:${item.sub}`, item.sub, folder);
  // Same document saved before (by ref + folder + name, or the same stored file): update it in place.
  const fileRow = `gfile:${item.ref}:${item.sub}:${item.as === 'file' ? item.fileUrl : name}`;
  const known = await getRow(env, fileRow);
  let existing = null;
  if (known?.id) {
    const f = await drive(token, `/drive/v3/files/${known.id}?fields=id,trashed`);
    if (f && !f.trashed) existing = f.id;
  }
  if (existing && item.as === 'file') return {id: existing, link: 'https://drive.google.com/file/d/' + existing + '/view', folderLink: folderLink(folder), unchanged: true};
  const m = multipart(existing ? {name} : {...meta, parents: [sub]}, type, bytes);
  const f = await drive(token, existing ? `/upload/drive/v3/files/${existing}?uploadType=multipart&fields=id,webViewLink` : '/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {method: existing ? 'PATCH' : 'POST', headers: {'content-type': m.type}, body: m.body});
  await putRow(env, fileRow, {id: f.id});
  return {id: f.id, link: f.webViewLink, folderLink: folderLink(folder), updated: !!existing};
}
export async function eventFolderLink(env, ref) {
  const r = await getRow(env, 'gfolder:' + ref);
  return r?.id ? folderLink(r.id) : '';
}
