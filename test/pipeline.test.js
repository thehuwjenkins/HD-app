import test from 'node:test';
import assert from 'node:assert/strict';
import {makeD1, makeR2, sampleState, seedLegacy} from './fakes.js';
import {validate, stageOf, STAGES, STAGE_BOOKING} from '../public/app/stock.js';
import {migrate} from '../src/migrate.js';
import {applyChanges} from '../src/store.js';
import {crewPage} from '../src/pages.js';

test('jobs saved before the pipeline get a stage from their reservation', () => {
  assert.equal(stageOf({booking: 'Draft'}), 'enquiry');
  assert.equal(stageOf({booking: 'Reserved'}), 'booked');
  assert.equal(stageOf({booking: 'Returned'}), 'returned');
  assert.equal(stageOf({booking: 'Reserved', stage: 'out'}), 'out');
  assert.equal(stageOf({booking: 'Draft', stage: 'nonsense'}), 'enquiry');
});

test('every stage maps to a reservation the stock checker understands', () => {
  assert.deepEqual(STAGES, ['enquiry', 'quote', 'booked', 'out', 'returned', 'invoiced']);
  for (const s of STAGES) assert.ok(['Draft', 'Reserved', 'Returned'].includes(STAGE_BOOKING[s]));
});

test('a job whose stage and reservation disagree is refused', () => {
  const s = sampleState();
  s.jobs[0].stage = 'quote'; // but booking is Reserved
  assert.throws(() => validate(s), /stage and stock reservation do not match/);
  s.jobs[0].stage = 'out';
  validate(s);
  s.jobs[0].stage = 'paid';
  assert.throws(() => validate(s), /stage/);
});

test('an enquiry without dates or kit is allowed; booking it needs both', () => {
  const s = sampleState();
  s.jobs.push({id: 31, title: 'Wedding enquiry', booking: 'Draft', stage: 'enquiry', start: '', end: '', kit: []});
  validate(s);
  s.jobs[1].booking = 'Reserved'; s.jobs[1].stage = 'booked';
  assert.throws(() => validate(s), /valid reservation times/);
});

test('stage is a searchable column, including for jobs saved before the pipeline', async () => {
  const env = {DB: makeD1(), BACKUPS: makeR2(), FILES: makeR2()};
  seedLegacy(env, sampleState());
  assert.ok((await migrate(env, 'huw@example.com')).ok);
  assert.equal(env.DB.raw.prepare('SELECT stage FROM jobs WHERE id=30').get().stage, 'booked');
  await applyChanges(env, 'huw@example.com', [
    {collection: 'jobs', id: 30, op: 'put', version: 1, data: {...sampleState().jobs[0], stage: 'out'}},
    {collection: 'tasks', id: 7, op: 'put', version: 0, data: {id: 7, title: 'Call', due: '2026-12-01', done: false}},
  ]);
  assert.equal(env.DB.raw.prepare('SELECT stage FROM jobs WHERE id=30').get().stage, 'out');
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM jobs WHERE stage='out'").get().n, 1);
  assert.equal(env.DB.raw.prepare('SELECT due FROM tasks WHERE id=7').get().due, '2026-12-01');
});

test('crew page: upcoming first, recent jobs folded away, plain labels, nothing internal', () => {
  const s = sampleState();
  s.jobs = [
    {id: 1, title: 'Past Gig', booking: 'Returned', stage: 'invoiced', start: '2026-10-01T08:00', end: '2026-10-02T10:00', staffId: 10, venue: 'Old Hall', kit: [], notes: 'secret note', discount: 50},
    {id: 2, title: 'Winter Ball', booking: 'Reserved', stage: 'booked', start: '2026-12-12T09:00', end: '2026-12-13T12:00', staffId: 10, venue: 'Town Hall, Leeds & Co', load: 'Load in 10:00', kit: [{item: 'Nexo PS10', qty: 1, price: 999}]},
    {id: 3, title: 'Maybe Fair', booking: 'Draft', stage: 'quote', start: '2026-12-20', end: '2026-12-20', staffId: 10, kit: []},
    {id: 4, title: 'Someone Else', booking: 'Draft', start: '2026-12-01', end: '2026-12-01', staffId: 99, kit: []},
  ];
  const html = crewPage(s, 'sam@example.com', '2026-11-22');
  assert.match(html, /Hi Sam/);
  assert.ok(html.indexOf('Winter Ball') < html.indexOf('Maybe Fair'), 'upcoming in date order');
  assert.ok(html.indexOf('<details>') < html.indexOf('Past Gig'), 'past jobs folded away');
  assert.match(html, /Confirmed[\s\S]*Winter Ball/);
  assert.match(html, /Provisional[\s\S]*Maybe Fair/);
  assert.match(html, /Saturday 12 December from 09:00/);
  assert.match(html, /Until Sun 13 Dec 12:00/);
  assert.match(html, /Town Hall, Leeds &amp; Co/);
  assert.match(html, /maps\/search\/\?api=1&amp;query=Town%20Hall%2C%20Leeds%20%26%20Co/);
  assert.doesNotMatch(html, /Someone Else|secret note|999|£/);
});

test('crew page escapes job text', () => {
  const s = sampleState();
  s.jobs[0].title = '<img src=x onerror=alert(1)>';
  s.jobs[0].load = '"><script>alert(1)</script>';
  const html = crewPage(s, 'sam@example.com', '2026-01-01');
  assert.doesNotMatch(html, /<img src=x|<script>alert/);
});
