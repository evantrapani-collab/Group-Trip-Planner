# ✈️ TripTogether

[![CI](https://github.com/evantrapani-collab/Group-Trip-Planner/actions/workflows/ci.yml/badge.svg)](https://github.com/evantrapani-collab/Group-Trip-Planner/actions/workflows/ci.yml)

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
| 🔄 **Live sync** | The trip refreshes itself every few seconds, so the whole group sees changes without reloading. |
| ⏳ **Countdown** | Once dates are set, the overview counts down to departure. |
| 📆 **Calendar export** | Download the itinerary as an `.ics` file for Google/Apple Calendar, or print it to PDF. |
| 📊 **Budget chart** | A per-category breakdown bar shows where the money goes. |
| ⌨️ **Shortcuts** | Keys 1–8 jump between tabs; the invite button uses the native share sheet on mobile. |

## How we're different

Group travel is a crowded market, but it's split in two: **planners**
(Wanderlog, Troupe, TripIt) handle itineraries and polls, while **money apps**
(Splitwise, Venmo) handle the bill. Most groups end up juggling one of each.

TripTogether spans both — voting, dates, budget, settle-up, itinerary, and
tasks in one place — and adds the thing none of them do:

- **No accounts, no passwords, no install.** Share a 6-letter code, join with
  just a name.
- **All-in-one, including the settle-up math** that planners usually outsource.
- **Free and self-hostable** — a single Node/SQLite container, not a SaaS tier.

In short: *the no-signup, share-a-code app that replaces the planner + Splitwise
combo for a single group trip.* See [COMPETITORS.md](./COMPETITORS.md) for the
full market breakdown.

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

## Deploy it to the web

The app is a single Node server packaged by the included [`Dockerfile`](./Dockerfile),
so it runs anywhere that runs a container. The one detail that matters is a
**persistent disk/volume mounted at `/data`**: the SQLite file lives at
`/data/trips.db`, and without a volume every trip is lost on restart or redeploy.

### Docker (any machine or VPS)

```bash
docker build -t triptogether .
docker run -p 3000:3000 -v triptogether-data:/data triptogether
# → http://localhost:3000
```

The named volume `triptogether-data` keeps your database between runs.

### Hosted container platforms (Render, Fly.io, Railway, …)

This repo carries **no platform config files**. `render.yaml` and `fly.toml` were
removed in September 2026 because the app is not deployed anywhere, so there is no
one-click blueprint to import. Any host that builds from a Dockerfile works; give it
three things:

| Setting | Value |
|---|---|
| Build | from the repo's `Dockerfile` |
| Port | `3000` (the image sets `PORT=3000` and `HOST=0.0.0.0`) |
| Persistent volume | mounted at `/data` |

A plan with no persistent disk will still start: if `/data` cannot be used the server
falls back to a temp directory, and then to an in-memory database, logging a warning
either way. That is fine for a demo and wrong for a real trip, because the data does
not survive a redeploy.

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
  index.html  Static landing page + SPA shell (instant first paint, SEO meta)
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
