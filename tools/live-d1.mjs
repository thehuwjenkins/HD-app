// A D1 binding that talks to the live database over Cloudflare's API, so admin scripts can reuse
// the app's own saving code (version checks, history, audit log, all-or-nothing batches).
// Needs a Cloudflare API token with D1 Edit (CLOUDFLARE_API_TOKEN) and Node run with NODE_USE_ENV_PROXY=1 behind a proxy.
const ACCOUNT = 'ae708f09760121c96fb9b209d13a2ef7';
const DATABASE = '6a46a2e6-84d6-4b06-a4d3-e10462a82a83';
const URL_ = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DATABASE}/query`;

async function post(body) {
  const r = await fetch(URL_, {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer ' + (process.env.CLOUDFLARE_API_TOKEN || 'proxy-injected')}, body: JSON.stringify(body)});
  const d = await r.json();
  if (!d.success) throw Error((d.errors || []).map((e) => e.message).join('; ') || 'D1 request failed');
  return d.result;
}
class Stmt {
  constructor(sql, params = []) { this.sql = sql; this.params = params; }
  bind(...params) { return new Stmt(this.sql, params); }
  async all() { const [r] = await post({sql: this.sql, params: this.params}); return {results: r.results, meta: r.meta}; }
  async first() { return (await this.all()).results[0] ?? null; }
  async run() { return this.all(); }
}
export const liveDB = {
  prepare: (sql) => new Stmt(sql),
  async batch(stmts) {
    const out = await post({batch: stmts.map((s) => ({sql: s.sql, params: s.params}))});
    return out.map((r) => ({results: r.results, meta: r.meta}));
  },
};
