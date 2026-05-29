import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create (or open) a TripTogether database.
 * Pass ':memory:' for tests, or a file path for persistence.
 */
export function createDb(file) {
  const dbPath = file ?? process.env.TRIP_DB ?? join(__dirname, '..', 'data', 'trips.db');
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      share_code    TEXT NOT NULL UNIQUE,
      currency      TEXT NOT NULL DEFAULT 'USD',
      budget_total  REAL,
      chosen_destination_id TEXT,
      start_date    TEXT,
      end_date      TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS members (
      id         TEXT PRIMARY KEY,
      trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#6366f1',
      is_organizer INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS destinations (
      id          TEXT PRIMARY KEY,
      trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      est_cost    REAL,
      link        TEXT NOT NULL DEFAULT '',
      proposed_by TEXT REFERENCES members(id) ON DELETE SET NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS destination_votes (
      destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
      member_id      TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      PRIMARY KEY (destination_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS date_options (
      id         TEXT PRIMARY KEY,
      trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      start_date TEXT NOT NULL,
      end_date   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS date_votes (
      date_option_id TEXT NOT NULL REFERENCES date_options(id) ON DELETE CASCADE,
      member_id      TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      response       TEXT NOT NULL CHECK (response IN ('yes','maybe','no')),
      PRIMARY KEY (date_option_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS budget_items (
      id         TEXT PRIMARY KEY,
      trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      category   TEXT NOT NULL DEFAULT 'Other',
      label      TEXT NOT NULL,
      amount     REAL NOT NULL DEFAULT 0,
      per_person INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id          TEXT PRIMARY KEY,
      trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount      REAL NOT NULL,
      category    TEXT NOT NULL DEFAULT 'Other',
      paid_by     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      spent_on    TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expense_splits (
      expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      member_id  TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      weight     REAL NOT NULL DEFAULT 1,
      PRIMARY KEY (expense_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS itinerary_items (
      id         TEXT PRIMARY KEY,
      trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      day        TEXT NOT NULL DEFAULT '',
      time       TEXT NOT NULL DEFAULT '',
      title      TEXT NOT NULL,
      location   TEXT NOT NULL DEFAULT '',
      notes      TEXT NOT NULL DEFAULT '',
      sort       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      assigned_to TEXT REFERENCES members(id) ON DELETE SET NULL,
      done        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_members_trip ON members(trip_id);
    CREATE INDEX IF NOT EXISTS idx_dest_trip ON destinations(trip_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id);
    CREATE INDEX IF NOT EXISTS idx_itinerary_trip ON itinerary_items(trip_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_trip ON tasks(trip_id);
  `);
}
