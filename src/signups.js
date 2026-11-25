// Public "register interest" sign-ups, e.g. from the Aberavon Beach Fest page.
// POST /q/signup (public, CORS for the festival sites) stores or updates one person per list + email.
// HQ reads them at /api/signups (owner, and team members with the Event Planner).
export const LISTS = {beachfest: 'Aberavon Beach Fest'};
const ORIGINS = ['https://aberavon-beach-fest.huw-ae7.workers.dev', 'https://aberavonbeachfestival.co.uk', 'https://www.aberavonbeachfestival.co.uk', 'https://beachfest.hd-events.co.uk'];
const INTERESTS = ['music', 'kids', 'market', 'holistic', 'trader', 'perform', 'volunteer', 'sponsor'];
const MAX_ROWS = 50000;
const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,24}$/i;

const cors = (req) => {
  const o = req.headers.get('origin');
  return ORIGINS.includes(o) ? {'access-control-allow-origin': o, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', vary: 'origin'} : {};
};
const out = (req, body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json', 'cache-control': 'no-store', ...cors(req)}});
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export async function handleSignup(req, env) {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(req)});
  if (req.method !== 'POST') return out(req, {error: 'Not found'}, 404);
  if (!ORIGINS.includes(req.headers.get('origin'))) return out(req, {error: 'Forbidden'}, 403);
  if (Number(req.headers.get('content-length')) > 8000) return out(req, {error: 'Too much data'}, 413);
  let b;
  try { b = JSON.parse(await req.text()); } catch { return out(req, {error: 'Invalid form'}, 400); }
  if (b.website) return out(req, {ok: true}); // honeypot field: bots fill it, people never see it
  const list = Object.hasOwn(LISTS, b.list) ? b.list : null;
  const email = str(b.email, 254).toLowerCase(), name = str(b.name, 80);
  if (!list) return out(req, {error: 'Unknown list'}, 400);
  if (!name || !EMAIL.test(email)) return out(req, {error: 'Please give your name and a valid email address.'}, 422);
  if (b.consent !== true) return out(req, {error: 'Please tick the box so we can email you.'}, 422);
  const data = {
    name, email, town: str(b.town, 80), phone: str(b.phone, 30),
    interests: (Array.isArray(b.interests) ? b.interests : []).filter((x) => INTERESTS.includes(x)).slice(0, INTERESTS.length),
    business: str(b.business, 120), message: str(b.message, 1000),
    consent: {text: str(b.consentText, 300), at: new Date().toISOString()},
  };
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM signups').first();
  if (n.n >= MAX_ROWS) return out(req, {error: 'Sign-ups are full right now. Please try again later.'}, 503);
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO signups (list,email,data,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(list,email) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(list, email, JSON.stringify(data), now, now).run();
  return out(req, {ok: true});
}

export async function listSignups(env, list) {
  const r = await env.DB.prepare('SELECT id,list,data,created_at,updated_at FROM signups WHERE list=? ORDER BY created_at DESC LIMIT 50000').bind(list).all();
  return r.results.map((x) => ({id: x.id, list: x.list, createdAt: x.created_at, updatedAt: x.updated_at, ...JSON.parse(x.data)}));
}
export async function deleteSignups(env, ids) {
  const clean = (Array.isArray(ids) ? ids : []).filter(Number.isSafeInteger).slice(0, 1000);
  if (clean.length) await env.DB.prepare(`DELETE FROM signups WHERE id IN (${clean.map(() => '?').join(',')})`).bind(...clean).run();
  return clean.length;
}
