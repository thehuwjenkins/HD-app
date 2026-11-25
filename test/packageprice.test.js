import test from 'node:test';
import assert from 'node:assert/strict';
import {packagePricing, validate as validateState} from '../public/app/stock.js';
import {emptyState} from './fakes.js';

const inv = [
  {id: 1, name: 'PS10', qty: 4, service: 0, price: 45, value: 1200},
  {id: 2, name: 'PS10 flight case (pair)', qty: 2, service: 0, price: 15, value: 250},
];
const tot = (r) => Math.round(r.lines.reduce((s, x) => s + x.qty * x.unit, 0) * 100) / 100;

test('flight case included free, items priced at their own hire prices', () => {
  const r = packagePricing({items: [{id: 1, qty: 2}, {id: 2, qty: 1, free: true}]}, inv);
  assert.equal(r.price, 90);
  assert.equal(r.value, 2650);
  assert.equal(r.lines.find((x) => x.item.id === 2).unit, 0);
  assert.equal(tot(r), 90);
});

test('a package price is spread over the chargeable lines exactly', () => {
  for (const price of [100, 99.99, 0, 1]) {
    const r = packagePricing({price, items: [{id: 1, qty: 2}, {id: 2, qty: 1, free: true}]}, inv);
    assert.equal(r.price, price);
    assert.equal(tot(r), price, 'price ' + price);
    assert.equal(r.lines.find((x) => x.free).unit, 0);
  }
  const r = packagePricing({price: 100, items: [{id: 1, qty: 3}, {id: 2, qty: 1}]}, inv);
  assert.equal(tot(r), 100);
});

test('package price validated', () => {
  const s = emptyState(); s.inventory = structuredClone(inv);
  s.packages.push({id: 9, name: 'Pair', price: 90, items: [{id: 1, qty: 2}, {id: 2, qty: 1, free: true}]});
  validateState(s);
  s.packages[0].price = -1;
  assert.throws(() => validateState(s), /package price/);
});
