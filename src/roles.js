// Who can see and change what.
//
// - Owner (OWNER_EMAIL): everything, and the only person who can change Branding, People & access,
//   backups and history, and approve safety documents.
// - Team members (settings.access.members): only the sections the owner ticked. Collections outside
//   those sections are never sent to them, and money fields are stripped unless "money" is ticked.
//   The server refuses changes outside their sections and puts hidden money fields back on save.
// - Crew (Staff with an email): the read-only "My jobs" page.
// - Anyone else: refused.

export const SECTIONS = {
  overview: {label: 'Overview', pages: ['Overview'], write: [], read: []},
  planner: {label: 'Event Planner', pages: ['Event Planner'], write: ['plans'], read: ['plans', 'staff']},
  jobs: {label: 'Jobs, pipeline & calendar', pages: ['Pipeline', 'Calendar', 'Jobs', 'Cross-hire'], write: ['jobs', 'crewInvites', 'crossHires', 'clients'], read: ['jobs', 'crewInvites', 'crossHires', 'inventory', 'packages', 'staff', 'clients']},
  tasks: {label: 'Tasks & projects', pages: ['My Workday', 'Projects'], write: ['tasks', 'projects'], read: ['tasks', 'projects']},
  kit: {label: 'Kit & packages', pages: ['Inventory', 'Packages', 'Cross-hire'], write: ['inventory', 'packages', 'crossHires'], read: ['inventory', 'packages', 'crossHires', 'jobs']},
  people: {label: 'Staff & contacts', pages: ['Staff', 'Crew Portal', 'CRM'], write: ['staff', 'clients', 'crewInvites'], read: ['staff', 'clients', 'crewInvites', 'jobs']},
  money: {label: 'Money: prices, quotes, totals and crew fees', pages: [], write: ['quotes'], read: ['quotes']},
};
export const SECTION_KEYS = Object.keys(SECTIONS);
// Pages only the owner ever sees.
export const OWNER_PAGES = ['Branding', 'People & access'];

// Money fields per collection (top level), plus job kit line prices.
const MONEY_FIELDS = {inventory: ['price', 'value', 'valueEst', 'valueNote'], jobs: ['discount'], crewInvites: ['fee'], packages: ['price']};
// Job fields shown on plans to people who can see the planner but not jobs.
const JOB_SUMMARY = ['id', 'title', 'start', 'end', 'venue', 'stage', 'booking', 'client'];

const clean = (s) => String(s || '').trim().toLowerCase();

// Validate and tidy the access list the owner saves.
export function checkAccessSetting(value, ownerEmail) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.members)) throw Error('Invalid access list');
  if (value.members.length > 200) throw Error('Too many people on the access list');
  const seen = new Set();
  for (const m of value.members) {
    const email = clean(m?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Each person needs a valid email address');
    if (email === clean(ownerEmail)) throw Error('The owner already has full access');
    if (seen.has(email)) throw Error(email + ' is on the list twice');
    seen.add(email);
    if (typeof m.name !== 'string' || !m.name.trim()) throw Error('Each person needs a name');
    if (!Array.isArray(m.sections) || m.sections.some((s) => !SECTION_KEYS.includes(s))) throw Error('Invalid areas for ' + m.name);
  }
}

// Work out who this is. Returns {kind:'owner'|'member'|'crew'|'none', ...}.
export function whoIs(env, email, state) {
  if (email === clean(env.OWNER_EMAIL)) return {kind: 'owner', email};
  const m = (state?.access?.members || []).find((x) => clean(x.email) === email);
  if (m) {
    const sections = new Set(m.sections.filter((s) => SECTION_KEYS.includes(s)));
    const read = new Set(), write = new Set();
    for (const s of sections) {
      SECTIONS[s].read.forEach((c) => read.add(c));
      SECTIONS[s].write.forEach((c) => write.add(c));
    }
    // The planner shows linked jobs, read-only, unless jobs are also allowed.
    if (sections.has('planner')) read.add('jobs');
    return {kind: 'member', email, name: m.name, sections: [...sections], money: sections.has('money'), read, write};
  }
  if ((state?.staff || []).some((s) => clean(s.email) === email)) return {kind: 'crew', email};
  return {kind: 'none', email};
}

// What the browser is told about the signed-in person.
export function describe(who) {
  if (who.kind === 'owner') return {role: 'owner', email: who.email, sections: SECTION_KEYS, money: true, owner: true};
  return {role: 'member', name: who.name, sections: who.sections, money: who.money, owner: false, write: [...who.write]};
}

function stripMoney(collection, r) {
  const out = {...r};
  for (const f of MONEY_FIELDS[collection] || []) delete out[f];
  if (collection === 'jobs' && Array.isArray(out.kit)) out.kit = out.kit.map(({price, ...k}) => k);
  return out;
}

// The part of the workspace this person may see.
export function visibleState(state, versions, who) {
  if (who.kind === 'owner') return {state, versions};
  const s = {}, v = {settings: {}};
  for (const c of Object.keys(versions)) {
    if (c === 'settings') continue;
    if (!who.read.has(c)) { s[c] = []; v[c] = {}; continue; }
    let rows = state[c];
    if (c === 'jobs' && !who.sections.includes('jobs') && !who.sections.includes('kit') && !who.sections.includes('people'))
      rows = rows.map((j) => Object.fromEntries(JOB_SUMMARY.filter((k) => k in j).map((k) => [k, j[k]])));
    if (!who.money) rows = rows.map((r) => stripMoney(c, r));
    s[c] = rows;
    v[c] = versions[c];
  }
  // Company details and logo are shared; the access list and anything else stays with the owner.
  for (const k of ['company', 'branding', 'vehicles']) if (k in state) { s[k] = state[k]; v.settings[k] = versions.settings[k]; }
  return {state: s, versions: v};
}

export class Forbidden extends Error { constructor(m) { super(m); this.status = 403; } }

// Check a member's changes and put back anything they could not see. `current` is the full state.
export function prepareChanges(changes, current, who) {
  if (who.kind === 'owner') return changes;
  return changes.map((ch) => {
    if (ch.collection === 'settings') throw new Forbidden('Only Huw can change company settings.');
    if (!who.write.has(ch.collection)) throw new Forbidden('You do not have access to change ' + ch.collection + '.');
    const old = current[ch.collection].find((r) => r.id === ch.id);
    if (ch.collection === 'plans') checkApprovals(old, ch.op === 'put' ? ch.data : null);
    if (ch.op !== 'put' || who.money) return ch;
    const data = {...ch.data};
    for (const f of MONEY_FIELDS[ch.collection] || []) {
      if (old && f in old) data[f] = old[f]; else delete data[f];
    }
    if (ch.collection === 'jobs' && Array.isArray(data.kit)) {
      const prices = new Map((old?.kit || []).map((k) => [k.item, k.price]));
      const list = new Map(current.inventory.map((i) => [i.name, i.price]));
      data.kit = data.kit.map((k) => {
        const {price, ...rest} = k;
        const p = prices.has(k.item) ? prices.get(k.item) : list.get(k.item);
        return p === undefined ? rest : {...rest, price: p};
      });
    }
    if (ch.collection === 'crewInvites' && !old) data.fee = 0;
    return {...ch, data};
  });
}

// Only the owner can approve, change or withdraw an approved safety document.
function approvedDocs(plan) {
  const out = new Map();
  for (const st of plan?.stages || []) for (const it of st.items || []) if (it.doc?.status === 'approved') out.set(it.id, JSON.stringify(it.doc));
  return out;
}
function checkApprovals(oldPlan, newPlan) {
  const a = approvedDocs(oldPlan), b = approvedDocs(newPlan);
  if (a.size !== b.size || [...a].some(([id, d]) => b.get(id) !== d)) throw new Forbidden('Only Huw can approve, edit or withdraw an approved safety document.');
}

// Every email allowed to sign in: the owner, team members and crew.
export function allowedEmails(env, state) {
  const set = new Set([clean(env.OWNER_EMAIL)]);
  for (const m of state?.access?.members || []) if (clean(m.email)) set.add(clean(m.email));
  for (const s of state?.staff || []) if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(s.email))) set.add(clean(s.email));
  return [...set].sort();
}
