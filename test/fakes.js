// Minimal stand-ins for Cloudflare D1 (backed by real SQLite) and R2 (in memory).
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_workspace.sql', '0002_safety_layer.sql', '0003_tables.sql', '0004_pipeline.sql', '0005_planner.sql']) db.exec(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
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
        const out = list.map(s => {
          const st = db.prepare(s.sql);
          if (st.columns().length) return {results: st.all(...s.params), meta: {changes: 0}}; // SELECT returns rows, like D1
          const r = st.run(...s.params); return {results: [], meta: {changes: Number(r.changes)}};
        });
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
    async put(key, value, opts = {}) { store.set(key, {text: typeof value === 'string' ? value : null, bytes: typeof value === 'string' ? null : new Uint8Array(value), customMetadata: opts.customMetadata || {}, httpMetadata: opts.httpMetadata || {}, uploaded: new Date()}); },
    async get(key) { const o = store.get(key); return o ? {text: async () => o.text, body: o.text ?? o.bytes, customMetadata: o.customMetadata, httpMetadata: o.httpMetadata} : null; },
    async head(key) { return store.has(key) ? {} : null; },
    async delete(keys) { for (const k of [].concat(keys)) store.delete(k); },
    async list({prefix = ''} = {}) {
      return {truncated: false, objects: [...store].filter(([k]) => k.startsWith(prefix)).map(([key, o]) => ({key, size: (o.text ?? o.bytes).length, uploaded: o.uploaded, customMetadata: o.customMetadata}))};
    },
  };
}

export const emptyState = () => ({jobs: [], inventory: [], staff: [], clients: [], tasks: [], projects: [], packages: [], crewInvites: [], crossHires: [], quotes: [], plans: []});
export function sampleState() {
  const s = emptyState();
  s.inventory.push({id: 1, name: 'Nexo PS10', qty: 4, service: 0}, {id: 2, name: 'XLR 10m', qty: 40, service: 2});
  s.staff.push({id: 10, name: 'Sam', email: 'sam@example.com'});
  s.clients.push({id: 20, name: 'Village Hall'});
  s.jobs.push({id: 30, title: 'Summer Fete', booking: 'Reserved', start: '2026-07-01T08:00', end: '2026-07-02T18:00', staffId: 10, venue: 'Green', load: '09:00', kit: [{item: 'Nexo PS10', qty: 2}]});
  return s;
}

// Put a workspace into the old single-record table, as the live app has it today.
export function seedLegacy(env, state, revision = 7) {
  env.DB.raw.prepare('UPDATE workspace SET payload=?, revision=? WHERE id=1').run(JSON.stringify(state), revision);
}
// Static assets binding: serves files from /public.
import {readFile} from 'node:fs/promises';
export const assets = {
  async fetch(req) {
    const path = new URL(req.url).pathname;
    try { return new Response(await readFile(new URL('../public' + path, import.meta.url)), {headers: {'content-type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream'}}); }
    catch { return new Response('Not found', {status: 404}); }
  },
};
