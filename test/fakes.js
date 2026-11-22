// Minimal stand-ins for Cloudflare D1 (backed by real SQLite) and R2 (in memory).
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_workspace.sql', '0002_safety_layer.sql']) db.exec(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  const stmt = (sql, params = []) => ({
    sql, params,
    bind: (...p) => stmt(sql, p),
    first: async () => db.prepare(sql).get(...params) ?? null,
    all: async () => ({results: db.prepare(sql).all(...params)}),
    run: async () => { const r = db.prepare(sql).run(...params); return {meta: {changes: Number(r.changes)}}; },
  });
  return {
    raw: db,
    prepare: sql => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try {
        const out = list.map(s => { const r = db.prepare(s.sql).run(...s.params); return {meta: {changes: Number(r.changes)}}; });
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

export function makeR2() {
  const store = new Map();
  return {
    store,
    async put(key, text, opts = {}) { store.set(key, {text: String(text), customMetadata: opts.customMetadata || {}, uploaded: new Date()}); },
    async get(key) { const o = store.get(key); return o ? {text: async () => o.text, body: o.text, customMetadata: o.customMetadata} : null; },
    async delete(keys) { for (const k of [].concat(keys)) store.delete(k); },
    async list({prefix = ''} = {}) {
      return {truncated: false, objects: [...store].filter(([k]) => k.startsWith(prefix)).map(([key, o]) => ({key, size: o.text.length, uploaded: o.uploaded, customMetadata: o.customMetadata}))};
    },
  };
}

export const emptyState = () => ({jobs: [], inventory: [], staff: [], clients: [], tasks: [], projects: [], packages: [], crewInvites: [], crossHires: [], quotes: []});
export function sampleState() {
  const s = emptyState();
  s.inventory.push({id: 1, name: 'Nexo PS10', qty: 4, service: 0}, {id: 2, name: 'XLR 10m', qty: 40, service: 2});
  s.staff.push({id: 10, name: 'Sam', email: 'sam@example.com'});
  s.clients.push({id: 20, name: 'Village Hall'});
  s.jobs.push({id: 30, title: 'Summer Fete', booking: 'Reserved', start: '2026-07-01T08:00', end: '2026-07-02T18:00', staffId: 10, venue: 'Green', load: '09:00', kit: [{item: 'Nexo PS10', qty: 2}]});
  return s;
}
