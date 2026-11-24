import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validate, powerEstimate, supplierGaps, DOC_KINDS} from '../public/app/stock.js';
import {sampleState} from './fakes.js';

// planner-template.js is a plain browser script: run it in a sandbox with the one helper it uses.
const ctx = {addDays: (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../public/app/planner-template.js', import.meta.url), 'utf8') + ';this.planFromTemplate=planFromTemplate;this.PLAN_TEMPLATES=PLAN_TEMPLATES;', ctx);
const titles = stages => stages.flatMap(s => s.items.map(i => i.title));

test('the checklist only includes what the event profile needs', () => {
  const indoor = ctx.planFromTemplate('general', '2027-07-24', {capacity: 120});
  const festival = ctx.planFromTemplate('general', '2027-07-24', {capacity: 3000, outdoor: true, alcohol: true, food: true, liveMusic: true, structures: true, generators: true, rigging: true});
  assert.ok(titles(festival).length > titles(indoor).length + 30);
  assert.ok(!titles(indoor).some(t => /TEN|Food traders|SIA/.test(t)));
  for (const t of ['Premises licence or Temporary Event Notice (TEN)', 'Food traders: LPG gas safety certificates (Gas Safe engineer)', 'SIA licensed security booked', 'Crowd management plan and risk assessment', 'Generator sizing, fuel plan and refuelling procedure'])
    assert.ok(titles(festival).includes(t), t);
  // The legal basics are always there.
  for (const t of ['Event risk assessment', 'Fire risk assessment', 'Public liability insurance (typically £5m to £10m)', 'PAT / in-service inspection and testing certificates for all equipment'])
    assert.ok(titles(indoor).includes(t), t);
});

test('every template item has a valid stage, deadline, and document kind; most explain why', () => {
  const all = ctx.planFromTemplate('general', '2027-07-24', {capacity: 5000, outdoor: true, alcohol: true, food: true, liveMusic: true, structures: true, generators: true, rigging: true, children: true, camping: true, traffic: true, sfx: true, drones: true});
  const items = all.flatMap(s => s.items);
  assert.ok(items.length >= 100, 'at least 100 items for a full festival, got ' + items.length);
  for (const i of items) {
    assert.match(i.due, /^\d{4}-\d\d-\d\d$/);
    if (i.doc) assert.ok(DOC_KINDS.includes(i.doc.kind), i.doc.kind);
  }
  assert.ok(items.filter(i => i.why).length / items.length > 0.5);
  assert.equal(new Set(items.map(i => i.id)).size, items.length);
  validate({...sampleState(), plans: [{id: 1, title: 'Fest', stages: all, suppliers: []}]});
});

test('generator sizing from supplier power', () => {
  assert.deepEqual(powerEstimate([]).size, null);
  const est = powerEstimate([{kw: 12}, {kw: 9, phase: '3'}, {kw: 4}, {name: 'no figure'}]);
  assert.equal(est.kw, 25);
  assert.equal(est.kva, 27.3); // 25 × 0.7 ÷ 0.8 × 1.25
  assert.equal(est.size, 30);
  assert.equal(est.threePhase, true);
  assert.equal(est.missing, 1);
  assert.equal(powerEstimate([{kw: 2000}]).size, null);
});

test('supplier compliance gaps', () => {
  const food = {name: 'Burger van', type: 'food', kw: 6, pliExpiry: '2027-12-31', ra: true, ms: true, pat: '2027-03-01', foodReg: true, hygiene: '5', gasCert: true};
  assert.deepEqual(supplierGaps(food, '2027-07-24'), []);
  assert.deepEqual(supplierGaps({...food, pliExpiry: '2027-07-01', gasCert: false}, '2027-07-24'), ['Public liability expired', 'Gas safety certificate (LPG)']);
  assert.deepEqual(supplierGaps({...food, gas: false, gasCert: false}, '2027-07-24'), []);
  assert.ok(supplierGaps({...food, pat: '2026-01-01'}, '2027-07-24').includes('PAT records over 12 months old'));
  assert.ok(supplierGaps({name: 'Door team', type: 'security'}).includes('SIA licence numbers'));
  assert.ok(!supplierGaps({name: 'Door team', type: 'security'}).includes('Power requirement'));
});

test('suppliers on a plan are validated', () => {
  const plan = s => ({...sampleState(), plans: [{id: 1, title: 'Fest', stages: [], suppliers: s}]});
  validate(plan([{id: 1, name: 'Bar Co', type: 'bar', kw: '7.5'}]));
  assert.throws(() => validate(plan([{id: 1, name: ' '}])), /needs a name/);
  assert.throws(() => validate(plan([{id: 1, name: 'A'}, {id: 1, name: 'B'}])), /invalid supplier/);
  assert.throws(() => validate(plan([{id: 1, name: 'A', kw: '-3'}])), /power/);
});

import {inventoryTotals, loadCheck} from '../public/app/stock.js';
test('inventory totals: value and weight, counting estimates and gaps', () => {
  const t = inventoryTotals([
    {name: 'SQ5', qty: 1, value: 2200, valueEst: true, weightKg: 18.5, weightEst: false},
    {name: 'PS10', qty: 4, value: 600, weightKg: 22.6},
    {name: 'Custom case', qty: 2, weightKg: 35, weightEst: true},
    {name: 'XLR', qty: 40},
  ]);
  assert.deepEqual(t, {lines: 4, units: 47, value: 4600, weight: 178.9, missingValue: 2, missingWeight: 1, estValue: 1, estWeight: 1});
});
test('van load check', () => {
  const inv = [{name: 'PS10', weightKg: 22.6}, {name: 'Case', weightKg: 35}, {name: 'XLR'}];
  const vans = [{id: 1, name: 'Transit', payloadKg: 1000}, {id: 2, name: 'Trailer', payloadKg: 750}];
  const job = {kit: [{item: 'PS10', qty: 20}, {item: 'Case', qty: 16}, {item: 'XLR', qty: 30}], vehicleIds: [1]};
  const r = loadCheck(job, inv, vans);
  assert.deepEqual(r, {kg: 1012, unknown: ['XLR'], payload: 1000, vehicles: ['Transit'], pct: 101, over: true});
  assert.equal(loadCheck({...job, vehicleIds: [1, 2]}, inv, vans).over, false);
  assert.equal(loadCheck({...job, vehicleIds: []}, inv, vans).pct, null);
});
