import test from 'node:test';
import assert from 'node:assert/strict';
import {makeD1, makeR2, sampleState, emptyState, seedLegacy} from './fakes.js';
import {applyChanges, loadState, undoTo, replaceAll, listSaves, isMigrated, Conflict} from '../src/store.js';
import {migrate} from '../src/migrate.js';
import {counts} from '../src/safety.js';

const OWNER = 'huw@example.com';
async function migratedEnv(state = sampleState()) {
  const env = {DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2()};
  seedLegacy(env, state);
  const r = await migrate(env, OWNER);
  assert.equal(r.ok, true, r.error);
  return env;
}
const put = (collection, data, version) => ({collection, id: data.id ?? data.key, op: 'put', version, data});

test('migration copies every record into tables, checks them and keeps the old record untouched', async () => {
  const s = sampleState();
  s.company = {name: 'HD Events'};
  for (let i = 0; i < 300; i++) s.clients.push({id: 5000 + i, name: 'Client ' + i, email: 'c' + i + '@example.com'});
  const env = {DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2()};
  seedLegacy(env, s);
  const r = await migrate(env, OWNER);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.before, counts(s));
  assert.deepEqual(r.after, counts(s));
  assert.match(r.backup, /^manual\//);
  assert.ok(env.BACKUPS.store.has(r.backup), 'safety backup taken first');
  const {state, versions} = await loadState(env);
  assert.deepEqual(state, s);
  assert.equal(versions.jobs[30], 1);
  assert.equal(await isMigrated(env), true);
  const legacy = env.DB.raw.prepare('SELECT revision,payload FROM workspace WHERE id=1').get();
  assert.equal(legacy.revision, 7);
  assert.deepEqual(JSON.parse(legacy.payload), s);
  const log = env.DB.raw.prepare('SELECT ok,before_counts,after_counts FROM migration_log').all();
  assert.equal(log.length, 1);
  assert.equal(log[0].ok, 1);
  assert.equal(log[0].before_counts, log[0].after_counts);
  assert.equal((await migrate(env, OWNER)).status, 409, 'refuses to run twice');
});

test('migration moves an embedded logo into file storage', async () => {
  const s = sampleState();
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  s.branding = {logo: 'data:image/png;base64,' + png.toString('base64')};
  const env = await migratedEnv(s);
  const {state} = await loadState(env);
  assert.match(state.branding.logo, /^\/files\/branding\/[0-9a-f]{64}\.png$/);
  const stored = env.FILES.store.get(state.branding.logo.slice(7));
  assert.deepEqual(Buffer.from(stored.bytes), png);
});

test('migration stops without switching over if backups are not set up', async () => {
  const env = {DB: makeD1(), FILES: makeR2()};
  seedLegacy(env, sampleState());
  const r = await migrate(env, OWNER);
  assert.equal(r.ok, false);
  assert.match(r.error, /safety backup/);
  assert.equal(await isMigrated(env), false);
});

test('migration refuses a workspace that fails its own checks', async () => {
  const s = sampleState();
  s.jobs[0].kit[0].qty = 99; // more than owned while Reserved
  const env = {DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2()};
  seedLegacy(env, s);
  const r = await migrate(env, OWNER);
  assert.equal(r.ok, false);
  assert.match(r.error, /fails its own checks/);
  assert.equal(await isMigrated(env), false);
});

test('a failed first attempt can be re-run cleanly', async () => {
  const env = {DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2()};
  seedLegacy(env, sampleState());
  env.DB.raw.exec(`INSERT INTO clients (id,version,data,updated_at,updated_by) VALUES (20,1,'{"id":20,"name":"half-done"}','x','x')`);
  const r = await migrate(env, OWNER);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual((await loadState(env)).state, sampleState());
});

test('saving one record writes only that record and bumps only its version', async () => {
  const env = await migratedEnv();
  const job = {...sampleState().jobs[0], venue: 'Main Field'};
  const r = await applyChanges(env, OWNER, [put('jobs', job, 1)]);
  assert.deepEqual(r.versions, [{collection: 'jobs', id: 30, version: 2}]);
  const {state, versions} = await loadState(env);
  assert.equal(state.jobs[0].venue, 'Main Field');
  assert.equal(versions.inventory[1], 1);
  const rows = env.DB.raw.prepare('SELECT collection,record_id,op FROM record_history WHERE reason=?').all('save');
  assert.deepEqual(rows.map(r => ({...r})), [{collection: 'jobs', record_id: '30', op: 'update'}]);
});

test('two devices editing different records do not conflict; the same record does', async () => {
  const env = await migratedEnv();
  const s = sampleState();
  await applyChanges(env, OWNER, [put('clients', {...s.clients[0], name: 'Village Hall Trust'}, 1)]);
  // Second device still has version 1 of everything, but edits a different record: fine.
  await applyChanges(env, OWNER, [put('staff', {...s.staff[0], name: 'Sam Jones'}, 1)]);
  // Same record from a stale copy: refused.
  await assert.rejects(applyChanges(env, OWNER, [put('clients', {...s.clients[0], name: 'Old name'}, 1)]), Conflict);
  assert.equal((await loadState(env)).state.clients[0].name, 'Village Hall Trust');
});

test('creates, deletes and settings', async () => {
  const env = await migratedEnv();
  await applyChanges(env, OWNER, [
    put('tasks', {id: 77, title: 'Call venue', done: false}, 0),
    {collection: 'clients', id: 20, op: 'delete', version: 1},
    {collection: 'settings', id: 'company', op: 'put', version: 0, data: {name: 'HD Events Ltd'}},
  ]);
  const {state, versions} = await loadState(env);
  assert.deepEqual(state.tasks, [{id: 77, title: 'Call venue', done: false}]);
  assert.equal(state.clients.length, 0);
  assert.deepEqual(state.company, {name: 'HD Events Ltd'});
  assert.equal(versions.settings.company, 1);
  await assert.rejects(applyChanges(env, OWNER, [put('tasks', {id: 77, title: 'dup'}, 0)]), Conflict, 'creating an existing id conflicts');
});

test('changes that break stock rules are refused and nothing is written', async () => {
  const env = await migratedEnv();
  const job = structuredClone(sampleState().jobs[0]);
  job.kit[0].qty = 50;
  await assert.rejects(applyChanges(env, OWNER, [put('tasks', {id: 78, title: 'x'}, 0), put('jobs', job, 1)]), /short by/);
  assert.equal((await loadState(env)).state.tasks.length, 0);
});

test('a conflict part-way through a save rolls back the whole save', async () => {
  const env = await migratedEnv();
  const real = env.DB.batch.bind(env.DB);
  // Another device changes the inventory row between our check and our write.
  env.DB.batch = async list => { env.DB.raw.exec('UPDATE inventory SET version=version+1 WHERE id=2'); return real(list); };
  await assert.rejects(applyChanges(env, OWNER, [put('tasks', {id: 79, title: 'x'}, 0), put('inventory', {id: 2, name: 'XLR 10m', qty: 41, service: 2}, 1)]), Conflict);
  env.DB.batch = real;
  assert.equal((await loadState(env)).state.tasks.length, 0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM record_history WHERE reason='save'").get().n, 0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM sync_guard').get().n, 0);
});

test('malformed change lists are refused', async () => {
  const env = await migratedEnv();
  for (const bad of [
    [{collection: 'secrets', id: 1, op: 'put', version: 0, data: {id: 1}}],
    [{collection: 'jobs', id: 'x', op: 'put', version: 0, data: {id: 'x'}}],
    [{collection: 'jobs', id: 1, op: 'put', version: 0, data: {id: 2}}],
    [{collection: 'settings', id: 'jobs', op: 'put', version: 0, data: {}}],
    [{collection: 'tasks', id: 1, op: 'drop', version: 0}],
  ]) await assert.rejects(applyChanges(env, OWNER, bad), e => e.status === 422);
});

test('undo puts back every record changed from that save onwards, and can itself be undone', async () => {
  const env = await migratedEnv();
  const original = (await loadState(env)).state;
  const a = await applyChanges(env, OWNER, [put('clients', {id: 20, name: 'Renamed'}, 1), put('tasks', {id: 80, title: 'New'}, 0)]);
  await applyChanges(env, OWNER, [{collection: 'jobs', id: 30, op: 'delete', version: 1}]);
  const u = await undoTo(env, OWNER, a.saveId);
  assert.deepEqual((await loadState(env)).state, original);
  // Undo the undo.
  await undoTo(env, OWNER, u.saveId);
  const after = (await loadState(env)).state;
  assert.equal(after.clients[0].name, 'Renamed');
  assert.equal(after.jobs.length, 0);
  const saves = await listSaves(env);
  assert.equal(saves[0].reason, 'restore');
});

test('replaceAll writes only differences and records an audit entry', async () => {
  const env = await migratedEnv();
  const next = sampleState();
  next.clients.push({id: 21, name: 'New Client'});
  const r = await replaceAll(env, OWNER, next, {imported: true});
  assert.deepEqual(r.versions, [{collection: 'clients', id: 21, version: 1}]);
  const audit = env.DB.raw.prepare("SELECT summary FROM audit_log WHERE action='restore'").get();
  assert.equal(JSON.parse(audit.summary).imported, true);
  await replaceAll(env, OWNER, emptyState());
  assert.deepEqual(counts((await loadState(env)).state), counts(emptyState()));
});

test('a workspace saved before the planner existed (no plans list) upgrades cleanly', async () => {
  const s = sampleState();
  delete s.plans;
  const env = {DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2()};
  seedLegacy(env, s);
  const r = await migrate(env, OWNER);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.after.plans, 0);
  assert.deepEqual((await loadState(env)).state.plans, []);
});
