// The website's Events page reads events published from HQ (Event Planner > Website listing).
// Public, like quote links: /q/events.json lists only events marked "Show on the website", with only
// the fields meant for the public, and /q/poster/... serves only posters those events use.
import {loadState} from './store.js';

const SITES = ['https://www.hd-events.co.uk', 'https://hd-events.co.uk'];
const POSTER = /^\/files\/(creative|plan)\/[0-9a-f]{64}\.(png|jpg|webp)$/;
const KEEP_PAST_DAYS = 365;

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const when = (v) => (/^\d{4}-\d\d-\d\d(T\d\d:\d\d)?$/.test(String(v || '')) ? String(v) : '');
const link = (v) => { try { const u = new URL(String(v || '')); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };

export function listedEvents(state, now = Date.now()) {
  const cutoff = now - KEEP_PAST_DAYS * 86400000;
  return (state.plans || [])
    .filter((p) => p.web?.show && when(p.web.start || p.eventDate))
    .map((p) => {
      const w = p.web, start = when(w.start) || when(p.eventDate);
      return {
        id: p.id,
        title: str(w.title || p.title, 120),
        start, end: when(w.end) || '',
        venue: str(w.venue ?? p.venue, 120), town: str(w.town, 80), address: str(w.address, 200),
        description: str(w.description, 1200),
        tickets: link(w.tickets), price: str(w.price, 60),
        status: ['sold out', 'cancelled'].includes(w.status) ? w.status : '',
        poster: POSTER.test(w.poster || '') ? '/q/poster/' + w.poster.slice(7) : '',
      };
    })
    .filter((e) => Date.parse((e.end || e.start).slice(0, 10)) + 86400000 > cutoff)
    .sort((a, b) => a.start.localeCompare(b.start));
}

function cors(req) {
  const o = req.headers.get('origin');
  return SITES.includes(o) ? {'access-control-allow-origin': o, vary: 'origin'} : {};
}
export async function handlePublicEvents(req, env, url) {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: {...cors(req), 'access-control-allow-methods': 'GET'}});
  if (req.method !== 'GET') return new Response('Not found', {status: 404});
  const {state} = await loadState(env);
  const events = listedEvents(state);
  if (url.pathname === '/q/events.json') {
    const body = JSON.stringify({events: events.map((e) => ({...e, poster: e.poster ? url.origin + e.poster : ''}))});
    return new Response(body, {headers: {'content-type': 'application/json', 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff', ...cors(req)}});
  }
  const key = url.pathname.slice('/q/poster/'.length);
  if (!events.some((e) => e.poster === '/q/poster/' + key) || !env.FILES) return new Response('Not found', {status: 404});
  const obj = await env.FILES.get(key);
  if (!obj) return new Response('Not found', {status: 404});
  return new Response(obj.body, {headers: {'content-type': obj.httpMetadata?.contentType || 'image/png', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'cross-origin'}});
}
