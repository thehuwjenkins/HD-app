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

import {packVehicle, planLoad} from '../public/app/stock.js';
test('van packing: everything fits, nothing overlaps, floats or sits on non-stackable kit', () => {
  const inv = [
    {name: 'PS10 case', lengthCm: 60, widthCm: 45, heightCm: 75, weightKg: 30},
    {name: 'Sub', lengthCm: 80, widthCm: 60, heightCm: 70, weightKg: 55},
    {name: 'Cable trunk', lengthCm: 60, widthCm: 40, heightCm: 40, weightKg: 20},
    {name: 'Desk', lengthCm: 120, widthCm: 80, heightCm: 30, weightKg: 35, stackable: false},
    {name: 'SM58', inCase: true}, {name: 'No size'},
  ];
  const kit = [{item: 'PS10 case', qty: 4}, {item: 'Sub', qty: 2}, {item: 'Cable trunk', qty: 20}, {item: 'Desk', qty: 1}, {item: 'SM58', qty: 6}, {item: 'No size', qty: 2}];
  const van = {name: 'Transit', lengthCm: 335, widthCm: 175, heightCm: 175, payloadKg: 1100};
  const r = planLoad(kit, inv, [van]);
  const p = r.loads[0].placed;
  assert.equal(p.length, 27);
  assert.deepEqual(r.left, []);
  assert.deepEqual(r.noSize, [{name: 'No size', qty: 2}]);
  assert.deepEqual(r.inside, [{name: 'SM58', qty: 6}]);
  const ov = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;
  for (const a of p) {
    assert.ok(a.x >= 0 && a.y >= 0 && a.z >= 0 && a.x + a.l <= 335 && a.y + a.w <= 175 && a.z + a.h <= 175, 'inside the van');
    for (const b of p) if (a !== b) assert.ok(!(ov(a.x, a.x + a.l, b.x, b.x + b.l) && ov(a.y, a.y + a.w, b.y, b.y + b.w) && ov(a.z, a.z + a.h, b.z, b.z + b.h)), 'no overlap');
    if (a.z > 0) {
      const under = p.filter((b) => b.z + b.h === a.z && ov(a.x, a.x + a.l, b.x, b.x + b.l) && ov(a.y, a.y + a.w, b.y, b.y + b.w));
      assert.ok(under.length && under.every((b) => b.stackable), a.name + ' sits on stackable kit');
    }
  }
  assert.equal(r.loads[0].kg, 4 * 30 + 2 * 55 + 20 * 20 + 35);
});
test('van packing: overflow moves to the next vehicle, and too-big items are reported', () => {
  const inv = [{name: 'Crate', lengthCm: 100, widthCm: 100, heightCm: 100, weightKg: 50}, {name: 'Truss 3m', lengthCm: 300, widthCm: 30, heightCm: 30, weightKg: 12}];
  const small = {name: 'Small van', lengthCm: 200, widthCm: 120, heightCm: 120, payloadKg: 800};
  const trailer = {name: 'Trailer', lengthCm: 250, widthCm: 130, heightCm: 110, payloadKg: 500};
  const r = planLoad([{item: 'Crate', qty: 4}, {item: 'Truss 3m', qty: 1}], inv, [small, trailer]);
  assert.equal(r.loads[0].placed.length, 2);
  assert.equal(r.loads[1].placed.length, 2);
  assert.deepEqual(r.left.map((b) => b.name), ['Truss 3m']);
  assert.match(packVehicle([], {name: 'X'}).error, /No load space size/);
});

import {importRows} from '../public/app/stock.js';
test('inventory import from a pasted spreadsheet or CSV (e.g. made with ChatGPT)', () => {
  const csv = 'Equipment,Category,Owned,Out of service,Length (cm),Width (cm),Height (cm),Weight each (kg),Weight estimated,Value each (£),Value estimated,Hire price per day (£),Notes\n' +
    'Allen & Heath SQ5,Audio,1,0,72,51,22,"18.5",No,"£2,350",Yes,120,"Used price, eBay sold, Nov 2026"\n' +
    'Nexo PS10,Audio,4,,66,45,78,22.6,,650,yes,45,\n\nTOTAL,,5,,,,,,,,,,\n';
  const r = importRows(csv);
  assert.deepEqual(r.items[0], {name: 'Allen & Heath SQ5', category: 'Audio', qty: 1, service: 0, lengthCm: 72, widthCm: 51, heightCm: 22, weightKg: 18.5, weightEst: false, value: 2350, valueEst: true, price: 120, notes: 'Used price, eBay sold, Nov 2026'});
  assert.equal(r.items[1].valueEst, true);
  assert.equal(r.items.length, 2, 'TOTAL row ignored');
  const tsv = importRows('Item\tQty\tWeight (kg)\tStackable\tInside case\nSM58\t6\t0.3\tyes\tyes\nDesk case\t1\t35\tno\tno');
  assert.deepEqual(tsv.items, [{name: 'SM58', qty: 6, weightKg: 0.3, inCase: true}, {name: 'Desk case', qty: 1, weightKg: 35, inCase: false, stackable: false}]);
  assert.throws(() => importRows('Foo,Bar\n1,2'), /Equipment/);
});
