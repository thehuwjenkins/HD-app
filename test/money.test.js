import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentStatus, withPayments, quoteSummary} from '../public/app/stock.js';

const job = (extra = {}) => ({title: 'Gala', start: '2027-06-12T10:00', kit: [{item: 'PA', qty: 1, price: 1000}], ...extra});
const pay = (amount, kind = 'payment') => ({at: '2027-01-01T12:00:00.000Z', amount, method: 'bank', kind});

test('discount: a fixed amount plus a percentage', () => {
  assert.equal(quoteSummary(job({discountPct: 10})).gross, 900);
  assert.equal(quoteSummary(job({discountPct: 10, discount: 50})).gross, 850);
  assert.equal(quoteSummary(job({discountPct: 150})).gross, 0, 'never below zero');
});

test('payment status: due, deposit, part paid, paid, overpaid, refunds', () => {
  assert.equal(paymentStatus(job()).status, 'Payment due');
  const dep = job({depositPct: 50});
  let ps = paymentStatus(dep);
  assert.deepEqual([ps.status, ps.deposit, ps.depositOwed, ps.balanceDate], ['Deposit due', 500, 500, '2027-06-05']);
  assert.equal(paymentStatus(dep, {company: {balanceDays: 14}}).balanceDate, '2027-05-29');
  assert.equal(paymentStatus({...dep, payments: [pay(200)]}).status, 'Deposit due');
  ps = paymentStatus({...dep, payments: [pay(500, 'deposit')]});
  assert.deepEqual([ps.status, ps.due, ps.depositOwed], ['Part paid', 500, 0]);
  assert.equal(paymentStatus({...dep, payments: [pay(500, 'deposit'), pay(500)]}).status, 'Paid');
  ps = paymentStatus({...dep, payments: [pay(1100)]});
  assert.deepEqual([ps.status, ps.overpaid], ['Overpaid', 100]);
  assert.equal(paymentStatus({...dep, payments: [pay(1100), pay(100, 'refund')]}).status, 'Paid');
  assert.equal(paymentStatus(job({paidAt: '2027-01-01'})).status, 'Paid', 'marked paid before payments existed');
  assert.equal(paymentStatus(job({kit: []})).status, 'No charge');
  assert.equal(paymentStatus(job(), {vatRegistered: true}).total, 1200);
});

test('withPayments keeps paidAt in step with the payments', () => {
  let j = withPayments(job(), [pay(400)]);
  assert.equal(j.paidAt, undefined);
  j = withPayments(j, [...j.payments, pay(600)]);
  assert.ok(j.paidAt);
  const at = j.paidAt;
  assert.equal(withPayments(j, [...j.payments, pay(10)]).paidAt, at, 'stays the date it was first paid');
  j = withPayments(j, [...j.payments, pay(600, 'refund')]);
  assert.equal(j.paidAt, undefined, 'a refund can make it unpaid again');
  assert.equal(withPayments(j, []).payments, undefined);
});
