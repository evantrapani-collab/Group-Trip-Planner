import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBalances, settle } from '../server/settle.js';

test('even split: payer is owed the others’ shares', () => {
  const bal = computeBalances([
    { amount: 90, paidBy: 'a', splits: [
      { memberId: 'a', weight: 1 }, { memberId: 'b', weight: 1 }, { memberId: 'c', weight: 1 },
    ] },
  ]);
  assert.equal(bal.get('a'), 60);  // paid 90, owes 30
  assert.equal(bal.get('b'), -30);
  assert.equal(bal.get('c'), -30);
});

test('balances net out to ~zero across many expenses', () => {
  const bal = computeBalances([
    { amount: 100, paidBy: 'a', splits: [{ memberId: 'a', weight: 1 }, { memberId: 'b', weight: 1 }] },
    { amount: 40, paidBy: 'b', splits: [{ memberId: 'a', weight: 1 }, { memberId: 'b', weight: 1 }] },
    { amount: 30, paidBy: 'c', splits: [{ memberId: 'a', weight: 1 }, { memberId: 'b', weight: 1 }, { memberId: 'c', weight: 1 }] },
  ]);
  const sum = [...bal.values()].reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(sum) < 0.01, `sum should be ~0, got ${sum}`);
});

test('settle produces transfers that clear all debts', () => {
  const bal = computeBalances([
    { amount: 120, paidBy: 'a', splits: ['a', 'b', 'c', 'd'].map((m) => ({ memberId: m, weight: 1 })) },
    { amount: 60, paidBy: 'b', splits: ['a', 'b', 'c', 'd'].map((m) => ({ memberId: m, weight: 1 })) },
  ]);
  const transfers = settle(bal);
  // Apply transfers back and confirm everyone lands at zero.
  const net = new Map(bal);
  for (const t of transfers) {
    net.set(t.from, net.get(t.from) + t.amount);
    net.set(t.to, net.get(t.to) - t.amount);
  }
  for (const [, v] of net) assert.ok(Math.abs(v) < 0.01);
});

test('no expenses -> no transfers', () => {
  assert.deepEqual(settle(computeBalances([])), []);
});

test('weighted split respects weights', () => {
  const bal = computeBalances([
    { amount: 100, paidBy: 'a', splits: [{ memberId: 'a', weight: 1 }, { memberId: 'b', weight: 3 }] },
  ]);
  // total weight 4: a owes 25, b owes 75. a paid 100 -> +75; b -> -75
  assert.equal(bal.get('a'), 75);
  assert.equal(bal.get('b'), -75);
});
