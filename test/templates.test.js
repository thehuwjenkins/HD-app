import test from 'node:test';
import assert from 'node:assert/strict';
import {whoIs, visibleState, prepareChanges} from '../src/roles.js';
import {COLLECTIONS} from '../src/store.js';

const env = {OWNER_EMAIL: 'huw@example.com'};
const tpl = {id: 7, name: 'Small PA', discount: 50, kit: [{item: 'Nexo PS10', qty: 2, price: 40}]};
const state = {jobs: [], inventory: [{id: 1, name: 'Nexo PS10', price: 40}], jobTemplates: [tpl],
  access: {members: [{name: 'Julian', email: 'j@x.com', sections: ['overview', 'jobs']}, {name: 'Pat', email: 'p@x.com', sections: ['planner']}]}};
const versions = {jobs: {}, inventory: {}, jobTemplates: {7: 1}, settings: {}};

test('job templates are a stored collection', () => assert.ok(COLLECTIONS.includes('jobTemplates')));

test('team members with jobs see templates without prices; planner-only members do not see them', () => {
  const j = visibleState(state, versions, whoIs(env, 'j@x.com', state));
  assert.equal(j.state.jobTemplates.length, 1);
  assert.equal(j.state.jobTemplates[0].discount, undefined);
  assert.equal(j.state.jobTemplates[0].kit[0].price, undefined);
  assert.deepEqual(visibleState(state, versions, whoIs(env, 'p@x.com', state)).state.jobTemplates, []);
});

test('a member without money saving a template keeps the hidden prices and discount', () => {
  const who = whoIs(env, 'j@x.com', state);
  const [ch] = prepareChanges([{collection: 'jobTemplates', id: 7, op: 'put', version: 1, data: {id: 7, name: 'Small PA v2', kit: [{item: 'Nexo PS10', qty: 3}]}}], state, who);
  assert.equal(ch.data.discount, 50);
  assert.equal(ch.data.kit[0].price, 40);
  assert.throws(() => prepareChanges([{collection: 'jobTemplates', id: 8, op: 'put', version: 0, data: {id: 8}}], state, whoIs(env, 'p@x.com', state)), /access/);
});
