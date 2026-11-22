import test from 'node:test';
import assert from 'node:assert/strict';
import {makeD1, makeR2, sampleState, emptyState} from './fakes.js';
import {saveWorkspace, listVersions, listAudit, restore, runBackup, status, readBackup, counts, diff, BACKUP_FORMAT} from '../safety.js';

const OWNER = 'huw@example.com';
function setup(extra = {}) {
  const env = {DB: makeD1(), BACKUPS: makeR2(), ...extra};
  return env;
}
const current = async env => { const r = await env.DB.prepare('SELECT revision,payload FROM workspace WHERE id=1').first(); return {revision: r.revision, state: JSON.parse(r.payload)}; };

test('a save keeps the replaced version and writes an audit entry', async () => {
  const env = setup();
  const r = await saveWorkspace(env, OWNER, 0, sampleState());
  assert.deepEqual(r, {status: 200, revision: 1});
  const versions = await listVersions(env);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].revision, 0);
  assert.equal(versions[0].saved_by, OWNER);
  const [entry] = await listAudit(env);
  assert.equal(entry.action, 'save');
  assert.equal(entry.revision, 1);
  assert.deepEqual(entry.summary.changes.jobs.added, ['Summer Fete']);
  assert.deepEqual(entry.summary.changes.inventory.counts, [2, 0, 0]);
});

test('a stale save is rejected and leaves no version or audit row', async () => {
  const env = setup();
  await saveWorkspace(env, OWNER, 0, sampleState());
  const r = await saveWorkspace(env, OWNER, 0, emptyState());
  assert.equal(r.status, 409);
  assert.equal((await listVersions(env)).length, 1);
  assert.equal((await listAudit(env)).length, 1);
  assert.equal((await current(env)).state.jobs.length, 1);
});

test('the audit summary is written only when the guarded update applies (changes() inside the batch)', async () => {
  const env = setup();
  // Simulate another device saving between our read and our batch.
  const realBatch = env.DB.batch.bind(env.DB);
  env.DB.batch = async list => { env.DB.raw.exec('UPDATE workspace SET revision=revision+1'); return realBatch(list); };
  const r = await saveWorkspace(env, OWNER, 0, sampleState());
  assert.equal(r.status, 409);
  assert.equal((await listAudit(env)).length, 0);
  assert.equal((await listVersions(env)).length, 0);
});

test('version history is capped at VERSIONS_KEEP', async () => {
  const env = setup({VERSIONS_KEEP: '5'});
  const s = sampleState();
  for (let rev = 0; rev < 9; rev++) { s.tasks.push({id: 100 + rev, title: 'Task ' + rev}); await saveWorkspace(env, OWNER, rev, s); }
  const versions = await listVersions(env);
  assert.equal(versions.length, 5);
  assert.deepEqual(versions.map(v => v.revision), [8, 7, 6, 5, 4]);
});

test('restoring a version works and can itself be undone', async () => {
  const env = setup();
  await saveWorkspace(env, OWNER, 0, sampleState());           // rev 1 = sample
  await saveWorkspace(env, OWNER, 1, emptyState());            // rev 2 = bad save wipes everything
  const good = (await listVersions(env)).find(v => v.revision === 1);
  const r = await restore(env, OWNER, {versionId: good.id});
  assert.deepEqual(r, {status: 200, revision: 3});
  assert.deepEqual(counts((await current(env)).state), counts(sampleState()));
  const [entry] = await listAudit(env);
  assert.equal(entry.action, 'restore');
  assert.equal(entry.summary.restoredFrom.fromRevision, 1);
  // The emptied state is still available, so the restore can be undone.
  assert.ok((await listVersions(env)).some(v => v.revision === 2 && v.reason === 'restore'));
});

test('daily backup is written, read back, verified and logged; status turns healthy', async () => {
  const now = new Date('2026-11-22T02:17:00Z');
  const env = setup();
  assert.equal((await status(env, now)).healthy, false);
  await saveWorkspace(env, OWNER, 0, sampleState());
  const r = await runBackup(env, {now});
  assert.equal(r.ok, true, r.error);
  assert.equal(r.key, 'daily/2026-11-22.json');
  const s = await status(env, new Date('2026-11-22T09:00:00Z'));
  assert.equal(s.healthy, true);
  assert.equal(s.lastSuccess.object_key, 'daily/2026-11-22.json');
  // Same format as the owner page's "Import backup", so a downloaded copy can be imported directly.
  const backup = JSON.parse(env.BACKUPS.store.get(r.key).text);
  assert.equal(backup.format, BACKUP_FORMAT.format);
  assert.equal(backup.version, 1);
  assert.equal(backup.storageKey, 'hde_hq_v1');
  assert.deepEqual(backup.records, counts(sampleState()));
  // Stale after 26 hours with no new backup.
  const later = await status(env, new Date('2026-11-23T05:00:00Z'));
  assert.equal(later.healthy, false);
  assert.match(later.problem, /No backup for 26 hours/);
});

test('backups older than 35 days are pruned; monthly copies are kept', async () => {
  const env = setup();
  await saveWorkspace(env, OWNER, 0, sampleState());
  for (let d = 0; d < 50; d++) await runBackup(env, {now: new Date(Date.UTC(2026, 9, 1 + d, 2, 17))});
  const keys = [...env.BACKUPS.store.keys()];
  const daily = keys.filter(k => k.startsWith('daily/')).sort();
  assert.ok(daily.length >= 30 && daily.length <= 36, 'kept ' + daily.length);
  assert.equal(daily.at(-1), 'daily/2026-11-19.json');
  assert.deepEqual(keys.filter(k => k.startsWith('monthly/')).sort(), ['monthly/2026-10.json', 'monthly/2026-11.json']);
});

test('a failed backup is logged, shown on the status panel and sent to the alert webhook', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({url, body: JSON.parse(init.body)}); return new Response('ok'); };
  try {
    const env = setup({ALERT_WEBHOOK: 'https://alerts.example/hook'});
    env.BACKUPS.put = async () => { throw Error('R2 unavailable'); };
    const r = await runBackup(env, {now: new Date('2026-11-22T02:17:00Z')});
    assert.equal(r.ok, false);
    const s = await status(env, new Date('2026-11-22T03:00:00Z'));
    assert.equal(s.healthy, false);
    assert.equal(sent.length, 1);
    assert.match(sent[0].body.text, /backup FAILED.*R2 unavailable/);
    assert.equal((await listAudit(env))[0].action, 'backup-failed');
  } finally { globalThis.fetch = realFetch; }
});

test('a tampered backup is detected and cannot be restored', async () => {
  const env = setup();
  await saveWorkspace(env, OWNER, 0, sampleState());
  const {key} = await runBackup(env, {now: new Date('2026-11-22T02:17:00Z')});
  const obj = env.BACKUPS.store.get(key);
  obj.text = obj.text.replace('Summer Fete', 'Summer Fate');
  assert.match((await readBackup(env, key)).error, /checksum/);
  const r = await restore(env, OWNER, {backupKey: key});
  assert.equal(r.status, 422);
  assert.equal((await current(env)).state.jobs[0].title, 'Summer Fete');
});

test('restore rejects unknown keys and paths outside the backup folders', async () => {
  const env = setup();
  assert.equal((await restore(env, OWNER, {backupKey: '../secrets.json'})).status, 400);
  assert.equal((await restore(env, OWNER, {backupKey: 'daily/2001-01-01.json'})).status, 422);
  assert.equal((await restore(env, OWNER, {versionId: 999})).status, 404);
});

test('restore drill: back up, lose the database contents, restore from the cloud copy, counts match', async () => {
  const env = setup();
  const s = sampleState();
  for (let i = 0; i < 25; i++) s.clients.push({id: 1000 + i, name: 'Client ' + i});
  await saveWorkspace(env, OWNER, 0, s);
  const before = counts((await current(env)).state);
  const {key, ok} = await runBackup(env, {now: new Date('2026-11-22T02:17:00Z')});
  assert.ok(ok);
  // Disaster: workspace contents and version history lost.
  env.DB.raw.exec(`UPDATE workspace SET payload='${JSON.stringify(emptyState())}'; DELETE FROM workspace_versions;`);
  assert.equal((await current(env)).state.clients.length, 0);
  const r = await restore(env, OWNER, {backupKey: key});
  assert.equal(r.status, 200, r.message);
  assert.deepEqual(counts((await current(env)).state), before);
  assert.deepEqual((await current(env)).state, s);
});

test('diff reports branding and company changes', () => {
  const a = sampleState(), b = {...sampleState(), company: {name: 'HD Events Ltd'}};
  assert.deepEqual(Object.keys(diff(a, b)), ['company']);
});
