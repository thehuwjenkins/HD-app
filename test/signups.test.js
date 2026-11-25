import test from 'node:test';
import assert from 'node:assert/strict';
import {makeD1} from './fakes.js';
import {handleSignup, listSignups, deleteSignups} from '../src/signups.js';

const env = {DB: makeD1()};
const SITE = 'https://aberavon-beach-fest.huw-ae7.workers.dev';
const post = (body, origin = SITE) => handleSignup(new Request('https://hq.example/q/signup', {method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify(body)}), env);
const good = {list: 'beachfest', name: 'Sam', email: 'Sam@Example.com', town: 'Port Talbot', interests: ['music', 'kids', 'hacker'], consent: true, consentText: 'Email me festival news'};

test('a sign-up is stored once per email, updated on repeat, with only known interests', async () => {
  let r = await post(good);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), SITE);
  r = await post({...good, town: 'Neath'});
  assert.equal(r.status, 200);
  const rows = await listSignups(env, 'beachfest');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, 'sam@example.com');
  assert.equal(rows[0].town, 'Neath');
  assert.deepEqual(rows[0].interests, ['music', 'kids']);
});

test('refused: other sites, no consent, bad email; bots filling the hidden field are silently dropped', async () => {
  assert.equal((await post(good, 'https://evil.example')).status, 403);
  assert.equal((await post({...good, email: 'b@x.com', consent: false})).status, 422);
  assert.equal((await post({...good, email: 'not-an-email'})).status, 422);
  assert.equal((await post({...good, email: 'bot@x.com', website: 'http://spam'})).status, 200);
  assert.equal((await listSignups(env, 'beachfest')).length, 1);
});

test('removing a sign-up', async () => {
  const [s] = await listSignups(env, 'beachfest');
  assert.equal(await deleteSignups(env, [s.id, 'x']), 1);
  assert.equal((await listSignups(env, 'beachfest')).length, 0);
});
