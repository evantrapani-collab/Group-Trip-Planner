# ✈️ TripTogether

**Plan group trips together — without the group-chat chaos.**

TripTogether is a shareable web app for coordinating a trip with friends, family,
or coworkers. Collect destination ideas and vote on them, find dates that work for
everyone, set and track a budget, split expenses fairly, build a shared itinerary,
and divvy up the to-dos — all in one place.

No accounts or passwords. Create a trip, share the 6-letter code, and everyone
hops in with just their name.

## Features

| | |
|---|---|
| 🗳️ **Destinations** | Pitch ideas, upvote favorites, see the leader, then lock one in. |
| 📅 **Dates** | Propose date ranges; everyone marks 👍 yes / 🤔 maybe / 👎 no. Set the winner. |
| 💰 **Budget** | Set a target and break costs down by category (total or per-person). Track planned vs. actually spent. |
| 🧾 **Expenses & settle-up** | Log who paid for what and who's splitting it. Get the **minimal set of payments** to square up. |
| 🗺️ **Itinerary** | A shared day-by-day plan with times, places, and notes. |
| ✅ **Tasks** | A shared to-do / packing checklist with assignments. |
| 👥 **People** | See who's in, invite by link, add people manually. |

## Quick start

```bash
npm install
npm start
# open http://localhost:3000
```

For development with auto-reload:

```bash
npm run dev
```

Run the test suite:

```bash
npm test
```

## How it works

- **Backend** — Node + [Express](https://expressjs.com/) with a
  [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) database. Data is
  persisted to `data/trips.db` by default (override with the `TRIP_DB` env var;
  use `:memory:` for ephemeral runs).
- **Frontend** — a dependency-free, single-page app in vanilla JS + modern CSS.
  No build step. State lives on the server; each browser remembers its identity
  per trip in `localStorage`.
- **Expense math** — `server/settle.js` is a pure module (no DB) that computes
  each member's net balance and a greedy minimal-transfer settlement. It's
  covered directly by unit tests.

### Identity model

Trips are shared via a 6-character code (e.g. `ABC123`). There are no passwords —
joining is as simple as entering your name. Joining again with the same name
re-uses your existing identity, so votes and expenses stay attached to you.
This keeps things frictionless for casual group planning; it is **not** intended
for sensitive data.

## Project layout

```
server/
  app.js      Express app factory + all API routes
  db.js       SQLite schema & migrations
  settle.js   Pure expense-splitting / settle-up math
  index.js    Server entry point
public/
  index.html  SPA shell
  styles.css  Styling
  app.js      SPA logic (routing, rendering, API client)
test/
  api.test.js     End-to-end API tests (in-memory DB)
  settle.test.js  Unit tests for the settlement math
```

## API overview

All endpoints are under `/api`. A trip can be referenced by its `id` or its
`share_code`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/trips` | Create a trip (returns trip + organizer) |
| `GET` | `/trips/:idOrCode` | Trip + members |
| `GET` | `/trips/:id/state` | Full aggregated snapshot (incl. settlement) |
| `PATCH` | `/trips/:id` | Update name/dates/budget/chosen destination |
| `POST` | `/trips/:id/members` | Join (idempotent by name) |
| `POST` | `/trips/:id/destinations` · `/destinations/:id/vote` | Propose / toggle vote |
| `POST` | `/trips/:id/dates` · `/dates/:id/vote` | Propose date range / vote yes-maybe-no |
| `POST` | `/trips/:id/budget` | Add a budget line item |
| `POST` | `/trips/:id/expenses` | Log an expense with participants |
| `POST` | `/trips/:id/itinerary` · `/trips/:id/tasks` | Itinerary / task items |

(`DELETE` and the relevant `PATCH` routes exist for each resource too.)

## License

MIT
