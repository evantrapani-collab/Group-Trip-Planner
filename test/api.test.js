import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

let server, base;

before(async () => {
  const app = createApp({ dbFile: ':memory:' });
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://localhost:${server.address().port}/api`;
      resolve();
    });
  });
});

after(() => server?.close());

const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

test('create trip requires a name and organizer', async () => {
  const r = await call('POST', '/trips', { name: '' });
  assert.equal(r.status, 400);
});

test('full happy path: create, join, vote, expense, settle', async () => {
  // create
  const created = await call('POST', '/trips', { name: 'Lisbon', organizerName: 'Alex' });
  assert.equal(created.status, 201);
  const { trip, member: alex } = created.body;
  assert.match(trip.share_code, /^[A-Z0-9]{6}$/);

  // look up by share code
  const byCode = await call('GET', `/trips/${trip.share_code}`);
  assert.equal(byCode.status, 200);
  assert.equal(byCode.body.trip.id, trip.id);

  // join
  const joined = await call('POST', `/trips/${trip.share_code}/members`, { name: 'Sam' });
  assert.equal(joined.status, 201);
  const sam = joined.body.member;

  // joining with the same name reuses identity
  const rejoin = await call('POST', `/trips/${trip.id}/members`, { name: 'sam' });
  assert.equal(rejoin.body.rejoined, true);
  assert.equal(rejoin.body.member.id, sam.id);

  // destination + voting toggle
  const dest = await call('POST', `/trips/${trip.id}/destinations`, { name: 'Porto', proposedBy: alex.id });
  const destId = dest.body.destination.id;
  let v = await call('POST', `/destinations/${destId}/vote`, { memberId: alex.id });
  assert.equal(v.body.voted, true);
  v = await call('POST', `/destinations/${destId}/vote`, { memberId: alex.id });
  assert.equal(v.body.voted, false); // toggled off

  // expense split evenly between alex & sam
  const exp = await call('POST', `/trips/${trip.id}/expenses`, {
    description: 'Airbnb', amount: 200, paidBy: alex.id, participants: [alex.id, sam.id],
  });
  assert.equal(exp.status, 201);

  const stateRes = await call('GET', `/trips/${trip.id}/state`);
  assert.equal(stateRes.status, 200);
  const s = stateRes.body;
  assert.equal(s.expenses.length, 1);
  assert.equal(s.settlement.totalSpent, 200);
  // sam should owe alex 100
  const samBal = s.settlement.balances.find((b) => b.memberId === sam.id).balance;
  assert.equal(samBal, -100);
  assert.equal(s.settlement.transfers.length, 1);
  assert.equal(s.settlement.transfers[0].from, sam.id);
  assert.equal(s.settlement.transfers[0].to, alex.id);
  assert.equal(s.settlement.transfers[0].amount, 100);
});

test('expense rejects bad amount and unknown payer', async () => {
  const c = await call('POST', '/trips', { name: 'T', organizerName: 'A' });
  const tid = c.body.trip.id;
  const a = c.body.member.id;
  assert.equal((await call('POST', `/trips/${tid}/expenses`, { description: 'x', amount: -5, paidBy: a })).status, 400);
  assert.equal((await call('POST', `/trips/${tid}/expenses`, { description: 'x', amount: 5, paidBy: 'nope' })).status, 400);
});

test('date voting upserts a member response', async () => {
  const c = await call('POST', '/trips', { name: 'T', organizerName: 'A' });
  const tid = c.body.trip.id;
  const a = c.body.member.id;
  const d = await call('POST', `/trips/${tid}/dates`, { startDate: '2026-07-01', endDate: '2026-07-08' });
  const oid = d.body.option.id;
  await call('POST', `/dates/${oid}/vote`, { memberId: a, response: 'yes' });
  await call('POST', `/dates/${oid}/vote`, { memberId: a, response: 'no' }); // changes vote
  const s = await call('GET', `/trips/${tid}/state`);
  const votes = s.body.dateOptions[0].votes;
  assert.equal(votes.length, 1);
  assert.equal(votes[0].response, 'no');
});

test('tasks toggle done', async () => {
  const c = await call('POST', '/trips', { name: 'T', organizerName: 'A' });
  const tid = c.body.trip.id;
  const task = await call('POST', `/trips/${tid}/tasks`, { title: 'Book car' });
  const taskId = task.body.task.id;
  const upd = await call('PATCH', `/tasks/${taskId}`, { done: true });
  assert.equal(upd.body.task.done, 1);
});

test('unknown trip returns 404', async () => {
  assert.equal((await call('GET', '/trips/ZZZZZZ/state')).status, 404);
});
