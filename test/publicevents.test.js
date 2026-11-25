import test from 'node:test';
import assert from 'node:assert/strict';
import {listedEvents} from '../src/publicevents.js';

const poster = '/files/creative/' + 'a'.repeat(64) + '.png';
const plans = [
  {id: 1, title: 'Beach Fest', eventDate: '2027-07-24', venue: 'Aberavon Beach', stages: [], suppliers: [{name: 'secret supplier'}], web: {show: true, start: '2027-07-24T12:00', description: 'Live music', tickets: 'https://tickets.example/b', price: 'From £15', poster, town: 'Port Talbot'}},
  {id: 2, title: 'Private party', eventDate: '2027-08-01', stages: [], web: {show: false, description: 'not public'}},
  {id: 3, title: 'Old gig', eventDate: '2020-01-01', stages: [], web: {show: true}},
  {id: 4, title: 'Bad link', eventDate: '2027-09-01', stages: [], web: {show: true, tickets: 'javascript:alert(1)', poster: '/files/plan/../x', status: 'weird'}},
];

test('only events marked "Show on the website", recent or upcoming, with only public fields', () => {
  const ev = listedEvents({plans}, Date.parse('2026-11-25'));
  assert.deepEqual(ev.map((e) => e.id), [1, 4]);
  const [a, b] = ev;
  assert.equal(a.poster, '/q/poster/creative/' + 'a'.repeat(64) + '.png');
  assert.equal(a.tickets, 'https://tickets.example/b');
  assert.equal(a.venue, 'Aberavon Beach');
  assert.ok(!('suppliers' in a) && !('stages' in a));
  assert.equal(b.tickets, '');
  assert.equal(b.poster, '');
  assert.equal(b.status, '');
  assert.equal(b.start, '2027-09-01');
});
