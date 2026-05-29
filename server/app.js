import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { customAlphabet } from 'nanoid';
import { createDb } from './db.js';
import { computeBalances, settle } from './settle.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const id = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);
const shareCode = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);

const PALETTE = [
  '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6',
  '#ef4444', '#10b981', '#3b82f6', '#f97316', '#06b6d4',
];

/**
 * Build the Express application. `dbFile` controls persistence
 * (':memory:' for tests, a path otherwise).
 */
export function createApp({ dbFile } = {}) {
  const db = createDb(dbFile);
  const app = express();
  app.use(express.json());

  // ---- helpers ---------------------------------------------------------
  const getTrip = (idOrCode) =>
    db.prepare('SELECT * FROM trips WHERE id = ? OR share_code = ?').get(idOrCode, idOrCode);

  const tripMembers = (tripId) =>
    db.prepare('SELECT * FROM members WHERE trip_id = ? ORDER BY created_at').all(tripId);

  const memberInTrip = (tripId, memberId) =>
    db.prepare('SELECT 1 FROM members WHERE id = ? AND trip_id = ?').get(memberId, tripId);

  // Wrap a handler so thrown errors become JSON 500s instead of crashing.
  const h = (fn) => (req, res) => {
    try {
      fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal error', detail: String(err.message || err) });
    }
  };

  // Lightweight health check for the hosting platform — no DB / static deps.
  app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'triptogether' }));

  const api = express.Router();

  // ---- trips -----------------------------------------------------------
  api.post('/trips', h((req, res) => {
    const { name, description = '', organizerName, currency = 'USD' } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Trip name is required' });
    if (!organizerName || !organizerName.trim())
      return res.status(400).json({ error: 'Your name is required' });

    const tripId = id();
    let code;
    // share_code is unique; retry on the rare collision.
    for (let i = 0; i < 5; i++) {
      code = shareCode();
      if (!db.prepare('SELECT 1 FROM trips WHERE share_code = ?').get(code)) break;
    }
    db.prepare(
      `INSERT INTO trips (id, name, description, share_code, currency) VALUES (?,?,?,?,?)`
    ).run(tripId, name.trim(), description.trim(), code, currency);

    const memberId = id();
    db.prepare(
      `INSERT INTO members (id, trip_id, name, color, is_organizer) VALUES (?,?,?,?,1)`
    ).run(memberId, tripId, organizerName.trim(), PALETTE[0]);

    res.status(201).json({ trip: getTrip(tripId), member: db.prepare('SELECT * FROM members WHERE id = ?').get(memberId) });
  }));

  api.get('/trips/:idOrCode', h((req, res) => {
    const trip = getTrip(req.params.idOrCode);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    res.json({ trip, members: tripMembers(trip.id) });
  }));

  api.patch('/trips/:id', h((req, res) => {
    const trip = getTrip(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const fields = ['name', 'description', 'currency', 'budget_total', 'start_date', 'end_date', 'chosen_destination_id'];
    const updates = [];
    const vals = [];
    for (const f of fields) {
      if (f in (req.body || {})) {
        updates.push(`${f} = ?`);
        vals.push(req.body[f]);
      }
    }
    if (updates.length) {
      vals.push(trip.id);
      db.prepare(`UPDATE trips SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    }
    res.json({ trip: getTrip(trip.id) });
  }));

  // Full aggregated snapshot for the trip dashboard.
  api.get('/trips/:id/state', h((req, res) => {
    const trip = getTrip(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const t = trip.id;
    const members = tripMembers(t);

    const destinations = db
      .prepare('SELECT * FROM destinations WHERE trip_id = ? ORDER BY created_at').all(t)
      .map((d) => ({
        ...d,
        voters: db.prepare('SELECT member_id FROM destination_votes WHERE destination_id = ?')
          .all(d.id).map((v) => v.member_id),
      }));

    const dateOptions = db
      .prepare('SELECT * FROM date_options WHERE trip_id = ? ORDER BY start_date').all(t)
      .map((o) => ({
        ...o,
        votes: db.prepare('SELECT member_id, response FROM date_votes WHERE date_option_id = ?').all(o.id),
      }));

    const budgetItems = db.prepare('SELECT * FROM budget_items WHERE trip_id = ? ORDER BY created_at').all(t);

    const expenses = db
      .prepare('SELECT * FROM expenses WHERE trip_id = ? ORDER BY created_at DESC').all(t)
      .map((e) => ({
        ...e,
        splits: db.prepare('SELECT member_id, weight FROM expense_splits WHERE expense_id = ?').all(e.id),
      }));

    const itinerary = db.prepare('SELECT * FROM itinerary_items WHERE trip_id = ? ORDER BY day, sort, time').all(t);
    const tasks = db.prepare('SELECT * FROM tasks WHERE trip_id = ? ORDER BY done, created_at').all(t);

    // Settle-up summary.
    const balInput = expenses.map((e) => ({
      amount: e.amount,
      paidBy: e.paid_by,
      splits: e.splits.map((s) => ({ memberId: s.member_id, weight: s.weight })),
    }));
    const balMap = computeBalances(balInput);
    const balances = members.map((m) => ({ memberId: m.id, balance: balMap.get(m.id) ?? 0 }));
    const transfers = settle(balMap);
    const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);

    res.json({
      trip, members, destinations, dateOptions, budgetItems,
      expenses, itinerary, tasks,
      settlement: { balances, transfers, totalSpent },
    });
  }));

  // ---- members ---------------------------------------------------------
  api.post('/trips/:id/members', h((req, res) => {
    const trip = getTrip(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    const existing = tripMembers(trip.id);
    // Reuse an identity if someone with the same name already joined.
    const match = existing.find((m) => m.name.toLowerCase() === name.trim().toLowerCase());
    if (match) return res.status(200).json({ member: match, rejoined: true });

    const memberId = id();
    const color = PALETTE[existing.length % PALETTE.length];
    db.prepare('INSERT INTO members (id, trip_id, name, color) VALUES (?,?,?,?)')
      .run(memberId, trip.id, name.trim(), color);
    res.status(201).json({ member: db.prepare('SELECT * FROM members WHERE id = ?').get(memberId) });
  }));

  api.delete('/members/:id', h((req, res) => {
    db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  }));

  // ---- destinations & voting ------------------------------------------
  api.post('/trips/:id/destinations', h((req, res) => {
    const trip = getTrip(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const { name, description = '', estCost = null, link = '', proposedBy = null } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Destination name is required' });
    const did = id();
    db.prepare(
      `INSERT INTO destinations (id, trip_id, name, description, est_cost, link, proposed_by)
       VALUES (?,?,?,?,?,?,?)`
    ).run(did, trip.id, name.trim(), description.trim(), estCost, (link || '').trim(), proposedBy);
    res.status(201).json({ destination: db.prepare('SELECT * FROM destinations WHERE id = ?').get(did) });
  }));

  api.delete('/destinations/:id', h((req, res) => {
    db.prepare('DELETE FROM destinations WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  }));

  // Toggle a member's vote for a destination.
  api.post('/destinations/:id/vote', h((req, res) => {
    const dest = db.prepare('SELECT * FROM destinations WHERE id = ?').get(req.params.id);
    if (!dest) return res.status(404).json({ error: 'Destination not found' });
    const { memberId } = req.body || {};
    if (!memberInTrip(dest.trip_id, memberId))
      return res.status(400).json({ error: 'Unknown member' });
    const existing = db.prepare('SELECT 1 FROM destination_votes WHERE destination_id = ? AND member_id = ?')
      .get(dest.id, memberId);
    if (existing) {
      db.prepare('DELETE FROM destination_votes WHERE destination_id = ? AND member_id = ?').run(dest.id, memberId);
      res.json({ voted: false });
    } else {
      db.prepare('INSERT INTO destination_votes (destination_id, member_id) VALUES (?,?)').run(dest.id, memberId);
      res.json({ voted: true });
    }
  }));

  // ---- date options & availability ------------------------------------
  api.post('/trips/:id/dates', h((req, res) => {
    const trip = getTrip(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const { startDate, endDate } = req.body || {};
    if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates are required' });
    const oid = id();
    db.prepare('INSERT INTO date_options (id, trip_id, start_date, end_date) VALUES (?,?,?,?)')
      .run(oid, trip.id, startDate, endDate);
    res.status(201).json({ option: db.prepare('SELECT * FROM date_options WHERE id = ?').get(oid) });
  }));

  api.delete('/dates/:id', h((req, res) => {
    db.prepare('DELETE FROM date_options WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  }));

  api.post('/dates/:id/vote', h((req, res) => {
    const opt = db.prepare('SELECT * FROM date_options WHERE id = ?').get(req.params.id);
    if (!opt) return res.status(404).json({ error: 'Date option not found' });
    const { memberId, response } = req.body || {};
    if (!memberInTrip(opt.trip_id, memberId)) return res.status(400).json({ error: 'Unknown member' });
    if (!['yes', 'maybe', 'no'].includes(response))
      return res.status(400).json({ error: 'response must be yes, maybe, or no' });
    db.prepare(
      `INSERT INTO date_votes (date_option_id, member_id, response) VALUES (?,?,?)
       ON CONFLICT(date_option_id, member_id) DO UPDATE SET response = excluded.response`
    ).run(opt.id, memberId, response);
    res.json({ ok: true });
  }));

  // ---- budget ----------------------------------------------------------
  api.post('/trips/:id/budget', h((req, res) => {
    const trip = getTrip(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const { category = 'Other', label, amount = 0, perPerson = false } = req.body || {};
    if (!label || !label.trim()) return res.status(400).json({ error: 'Label is required' });
    const bid = id();
    db.prepare('INSERT INTO budget_items (id, trip_id, category, label, amount, per_person) VALUES (?,?,?,?,?,?)')
      .run(bid, trip.id, category, label.trim(), Number(amount) || 0, perPerson ? 1 : 0);
    res.status(201).json({ item: db.prepare('SELECT * FROM budget_items WHERE id = ?').get(bid) });
  }));

  api.delete('/budget/:id', h((req, res) => {
    db.prepare('DELETE FROM budget_items WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  }));

  // ---- expenses --------------------------------------------------------
  api.post('/trips/:id/expenses', h((req, res) => {
    const trip = getTrip(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const { description, amount, category = 'Other', paidBy, spentOn = null, participants } = req.body || {};
    if (!description || !description.trim()) return res.status(400).json({ error: 'Description is required' });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Amount must be a positive number' });
    if (!memberInTrip(trip.id, paidBy)) return res.status(400).json({ error: 'paidBy must be a trip member' });

    // Default: split evenly across everyone in the trip.
    let parts = Array.isArray(participants) && participants.length
      ? participants
      : tripMembers(trip.id).map((m) => m.id);
    parts = parts.filter((pid) => memberInTrip(trip.id, pid));
    if (!parts.length) return res.status(400).json({ error: 'At least one participant is required' });

    const eid = id();
    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO expenses (id, trip_id, description, amount, category, paid_by, spent_on) VALUES (?,?,?,?,?,?,?)'
      ).run(eid, trip.id, description.trim(), amt, category, paidBy, spentOn);
      const ins = db.prepare('INSERT INTO expense_splits (expense_id, member_id, weight) VALUES (?,?,1)');
      for (const pid of parts) ins.run(eid, pid);
    });
    tx();
    res.status(201).json({ id: eid });
  }));

  api.delete('/expenses/:id', h((req, res) => {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  }));

  // ---- itinerary -------------------------------------------------------
  api.post('/trips/:id/itinerary', h((req, res) => {
    const trip = getTrip(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const { day = '', time = '', title, location = '', notes = '' } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
    const iid = id();
    const maxSort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM itinerary_items WHERE trip_id = ? AND day = ?')
      .get(trip.id, day).m;
    db.prepare(
      'INSERT INTO itinerary_items (id, trip_id, day, time, title, location, notes, sort) VALUES (?,?,?,?,?,?,?,?)'
    ).run(iid, trip.id, day, time, title.trim(), location.trim(), notes.trim(), maxSort + 1);
    res.status(201).json({ item: db.prepare('SELECT * FROM itinerary_items WHERE id = ?').get(iid) });
  }));

  api.delete('/itinerary/:id', h((req, res) => {
    db.prepare('DELETE FROM itinerary_items WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  }));

  // ---- tasks -----------------------------------------------------------
  api.post('/trips/:id/tasks', h((req, res) => {
    const trip = getTrip(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const { title, assignedTo = null } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
    const tid = id();
    db.prepare('INSERT INTO tasks (id, trip_id, title, assigned_to) VALUES (?,?,?,?)')
      .run(tid, trip.id, title.trim(), assignedTo);
    res.status(201).json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(tid) });
  }));

  api.patch('/tasks/:id', h((req, res) => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const { done, title, assignedTo } = req.body || {};
    db.prepare('UPDATE tasks SET done = ?, title = ?, assigned_to = ? WHERE id = ?').run(
      done === undefined ? task.done : done ? 1 : 0,
      title === undefined ? task.title : title,
      assignedTo === undefined ? task.assigned_to : assignedTo,
      task.id
    );
    res.json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id) });
  }));

  api.delete('/tasks/:id', h((req, res) => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  }));

  app.use('/api', api);

  // Static SPA.
  const publicDir = join(__dirname, '..', 'public');
  app.use(express.static(publicDir));
  // Client-side routing fallback for non-API GETs.
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(join(publicDir, 'index.html')));

  app.locals.db = db;
  return app;
}
