import test from 'node:test';
import assert from 'node:assert/strict';
import {makeD1, makeR2, sampleState, emptyState, seedLegacy} from './fakes.js';
import {runBackup, status, readBackup, restoreBackup, listAudit, counts, BACKUP_FORMAT} from '../src/safety.js';
import {migrate} from '../src/migrate.js';
import {loadState, applyChanges} from '../src/store.js';

const OWNER = 'huw@example.com';
async function setup(state = sampleState(), extra = {}) {
  const env = {DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2(), ...extra};
  seedLegacy(env, state);
  const r = await migrate(env, OWNER);
  assert.ok(r.ok, r.error);
  return env;
}

test('daily backup is written from the tables, read back, verified and logged', async () => {
  const now = new Date('2026-11-22T02:17:00Z');
  const env = await setup();
  const r = await runBackup(env, {now});
  assert.equal(r.ok, true, r.error);
  assert.equal(r.key, 'daily/2026-11-22.json');
  assert.equal((await status(env, new Date('2026-11-22T09:00:00Z'))).healthy, true);
  const backup = JSON.parse(env.BACKUPS.store.get(r.key).text);
  assert.equal(backup.format, BACKUP_FORMAT.format);
  assert.equal(backup.storageKey, 'hde_hq_v1');
  assert.deepEqual(backup.data, sampleState());
  const later = await status(env, new Date('2026-11-23T05:00:00Z'));
  assert.equal(later.healthy, false);
  assert.match(later.problem, /No backup for 26 hours/);
});

test('backups also work before the move to tables (from the old record)', async () => {
  const env = {DB: makeD1(), BACKUPS: makeR2()};
  seedLegacy(env, sampleState());
  const r = await runBackup(env, {now: new Date('2026-11-22T02:17:00Z')});
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(JSON.parse(env.BACKUPS.store.get(r.key).text).data, sampleState());
});

test('backups older than 35 days are pruned; monthly copies are kept', async () => {
  const env = await setup();
  for (let d = 0; d < 50; d++) await runBackup(env, {now: new Date(Date.UTC(2026, 9, 1 + d, 2, 17))});
  const keys = [...env.BACKUPS.store.keys()];
  const daily = keys.filter(k => k.startsWith('daily/')).sort();
  assert.ok(daily.length >= 30 && daily.length <= 36, 'kept ' + daily.length);
  assert.deepEqual(keys.filter(k => k.startsWith('monthly/')).sort(), ['monthly/2026-10.json', 'monthly/2026-11.json']);
});

test('a failed backup is logged, shown on the status panel and sent to the alert webhook', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('ok'); };
  try {
    const env = await setup(sampleState(), {ALERT_WEBHOOK: 'https://alerts.example/hook'});
    env.BACKUPS.put = async () => { throw Error('R2 unavailable'); };
    const r = await runBackup(env, {now: new Date('2026-11-22T02:17:00Z')});
    assert.equal(r.ok, false);
    assert.equal((await status(env, new Date('2026-11-22T03:00:00Z'))).healthy, false);
    assert.match(sent.at(-1).text, /backup FAILED.*R2 unavailable/);
    assert.equal((await listAudit(env))[0].action, 'backup-failed');
  } finally { globalThis.fetch = realFetch; }
});

test('a tampered backup is detected and cannot be restored', async () => {
  const env = await setup();
  const {key} = await runBackup(env, {now: new Date('2026-11-22T02:17:00Z')});
  const obj = env.BACKUPS.store.get(key);
  obj.text = obj.text.replace('Summer Fete', 'Summer Fate');
  assert.match((await readBackup(env, key)).error, /checksum/);
  assert.equal((await restoreBackup(env, OWNER, key)).status, 422);
  assert.equal((await loadState(env)).state.jobs[0].title, 'Summer Fete');
});

test('restore rejects paths outside the backup folders', async () => {
  const env = await setup();
  assert.equal((await restoreBackup(env, OWNER, '../secrets.json')).status, 400);
  assert.equal((await restoreBackup(env, OWNER, 'daily/2001-01-01.json')).status, 422);
});

test('restore drill: back up, lose every record, restore from the cloud copy, records match', async () => {
  const s = sampleState();
  for (let i = 0; i < 25; i++) s.clients.push({id: 1000 + i, name: 'Client ' + i});
  const env = await setup(s);
  const {key, ok} = await runBackup(env, {now: new Date('2026-11-22T02:17:00Z')});
  assert.ok(ok);
  // Disaster: every table emptied.
  env.DB.raw.exec('DELETE FROM jobs; DELETE FROM inventory; DELETE FROM clients; DELETE FROM staff; DELETE FROM settings; DELETE FROM record_history;');
  assert.equal((await loadState(env)).state.clients.length, 0);
  const r = await restoreBackup(env, OWNER, key);
  assert.equal(r.status, 200, r.message);
  assert.deepEqual((await loadState(env)).state, s);
});

test('old history is pruned by the daily backup after 90 days', async () => {
  const env = await setup();
  await applyChanges(env, OWNER, [{collection: 'tasks', id: 5, op: 'put', version: 0, data: {id: 5, title: 't'}}]);
  env.DB.raw.exec("UPDATE record_history SET at='2026-01-01T00:00:00Z'");
  await runBackup(env, {now: new Date('2026-11-22T02:17:00Z')});
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM record_history').get().n, 0);
});
