// TripTogether SPA — vanilla JS, no build step.
// State lives on the server; the client keeps a per-trip identity in localStorage.

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');

/* ----------------------------- API client ----------------------------- */
const api = {
  async req(method, path, body) {
    const res = await fetch('/api' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },
  get: (p) => api.req('GET', p),
  post: (p, b) => api.req('POST', p, b),
  patch: (p, b) => api.req('PATCH', p, b),
  del: (p) => api.req('DELETE', p),
};

/* ----------------------------- helpers -------------------------------- */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const money = (n, cur = state.trip?.currency || 'USD') => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n || 0);
  } catch {
    return `${cur} ${(n || 0).toFixed(2)}`;
  }
};
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const avatar = (m, cls = '') =>
  `<div class="avatar ${cls}" style="background:${esc(m.color)}" title="${esc(m.name)}">${esc(initials(m.name))}</div>`;
const fmtDate = (d) => (d ? new Date(d + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
const fmtRange = (a, b) => `${fmtDate(a)} – ${fmtDate(b)}`;

function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = 'toast'), 2800);
}

/* ----------------------------- state ---------------------------------- */
const state = {
  route: 'home',
  code: null,
  trip: null,
  data: null,     // full state snapshot
  member: null,   // my identity in current trip
  tab: 'overview',
  loading: false,
};

const memberKey = (tripId) => `tt:member:${tripId}`;
const saveMember = (tripId, m) => localStorage.setItem(memberKey(tripId), JSON.stringify(m));
const loadMember = (tripId) => {
  try { return JSON.parse(localStorage.getItem(memberKey(tripId))); } catch { return null; }
};

/* ----------------------------- routing -------------------------------- */
function parseRoute() {
  const hash = location.hash.replace(/^#/, '');
  const m = hash.match(/^\/trip\/([^/]+)/);
  if (m) return { route: 'trip', code: m[1].toUpperCase() };
  return { route: 'home' };
}

async function navigate() {
  const r = parseRoute();
  state.route = r.route;
  if (r.route === 'trip') {
    state.code = r.code;
    await loadTrip();
  }
  render();
}

async function loadTrip() {
  state.loading = true;
  render();
  try {
    const data = await api.get(`/trips/${encodeURIComponent(state.code)}/state`);
    state.data = data;
    state.trip = data.trip;
    const stored = loadMember(state.trip.id);
    // Make sure the stored identity still exists server-side.
    state.member = stored && data.members.find((m) => m.id === stored.id) ? stored : null;
  } catch (e) {
    state.data = null;
    state.trip = null;
    toast(e.message, true);
  } finally {
    state.loading = false;
  }
}

async function refresh() {
  try {
    state.data = await api.get(`/trips/${encodeURIComponent(state.code)}/state`);
    state.trip = state.data.trip;
  } catch (e) { toast(e.message, true); }
  render();
}

window.addEventListener('hashchange', navigate);

/* ----------------------------- render --------------------------------- */
function render() {
  if (state.route === 'home') return renderHome();
  if (state.loading && !state.data) return renderShell(`<div class="spin"></div>`);
  if (!state.trip) return renderShell(`<div class="card"><h2>Trip not found</h2><p class="muted">We couldn't find a trip with that code. Double-check the link, or start a new one.</p><a class="btn primary mt" href="#/">Go home</a></div>`);
  if (!state.member) return renderJoin();
  return renderTrip();
}

function topbar(inner = '') {
  return `
  <div class="topbar"><div class="container topbar-inner">
    <div class="logo" data-act="home"><span class="mark">✈️</span> Trip<b>Together</b></div>
    <div class="spacer"></div>
    ${inner}
  </div></div>`;
}

function renderShell(content) {
  app.innerHTML = topbar() + `<div class="container" style="padding-top:40px">${content}</div>`;
}

/* ------- home ------- */
function renderHome() {
  app.innerHTML = topbar() + `
  <div class="container">
    <section class="hero">
      <h1>Plan your group trip<br/><span class="grad">without the group chat chaos</span></h1>
      <p class="lead">Collect destination ideas and vote, find dates that work for everyone, set a budget, split expenses fairly, and build a shared itinerary — all in one place.</p>
    </section>

    <div class="home-cards">
      <div class="card">
        <h2>Start a new trip</h2>
        <p class="sub">Create a trip and get a code to share with your crew.</p>
        <form data-form="create">
          <label class="field"><span>Trip name</span><input name="name" placeholder="Summer in Lisbon" required maxlength="80" /></label>
          <label class="field"><span>Your name</span><input name="organizerName" placeholder="Alex" required maxlength="40" /></label>
          <label class="field"><span>Description (optional)</span><input name="description" placeholder="A week of sun, food & friends" maxlength="160" /></label>
          <button class="btn primary block" type="submit">Create trip →</button>
        </form>
      </div>
      <div class="card">
        <h2>Join a trip</h2>
        <p class="sub">Got a 6-letter code from a friend? Hop in.</p>
        <form data-form="join">
          <label class="field"><span>Trip code</span><input name="code" placeholder="ABC123" required maxlength="6" style="text-transform:uppercase;letter-spacing:3px;font-weight:700" /></label>
          <label class="field"><span>Your name</span><input name="name" placeholder="Sam" required maxlength="40" /></label>
          <button class="btn block" type="submit">Join trip</button>
        </form>
      </div>
    </div>

    <div class="feature-grid">
      ${[
        ['🗳️', 'Vote on destinations', 'Everyone pitches ideas. Upvotes surface the favorite — then lock it in.'],
        ['📅', 'Find the right dates', 'Propose date ranges and let people mark yes / maybe / no.'],
        ['💰', 'Budget together', 'Set a target and break it down by flights, stay, food and more.'],
        ['🧾', 'Split expenses fairly', 'Log who paid for what. We compute the simplest way to settle up.'],
        ['🗺️', 'Build an itinerary', 'A shared day-by-day plan so nobody misses the good stuff.'],
        ['✅', 'Share the to-dos', 'Assign tasks and packing items so nothing slips through.'],
      ].map(([i, h, p]) => `<div class="feature"><div class="ico">${i}</div><h3>${h}</h3><p>${p}</p></div>`).join('')}
    </div>
    <p class="empty">Built for friends, families and coworkers who'd rather travel than coordinate. 💛</p>
  </div>`;
}

/* ------- join existing trip ------- */
function renderJoin() {
  renderShell(`
    <div class="card" style="max-width:440px;margin:40px auto">
      <h2>You're invited to “${esc(state.trip.name)}”</h2>
      <p class="sub">${state.data.members.length} ${state.data.members.length === 1 ? 'person has' : 'people have'} joined so far. Add your name to take part.</p>
      <form data-form="joincurrent">
        <label class="field"><span>Your name</span><input name="name" placeholder="Your name" required maxlength="40" autofocus /></label>
        <button class="btn primary block" type="submit">Join trip</button>
      </form>
    </div>`);
}

/* ------- trip ------- */
const TABS = [
  ['overview', '🏠 Overview'],
  ['destinations', '🗳️ Destinations'],
  ['dates', '📅 Dates'],
  ['budget', '💰 Budget'],
  ['expenses', '🧾 Expenses'],
  ['itinerary', '🗺️ Itinerary'],
  ['tasks', '✅ Tasks'],
  ['people', '👥 People'],
];

function tabCount(key) {
  const d = state.data;
  return {
    destinations: d.destinations.length,
    dates: d.dateOptions.length,
    budget: d.budgetItems.length,
    expenses: d.expenses.length,
    itinerary: d.itinerary.length,
    tasks: d.tasks.filter((t) => !t.done).length,
    people: d.members.length,
  }[key];
}

function renderTrip() {
  const d = state.data;
  const t = state.trip;
  const meCard = `<div class="who">${avatar(state.member)} <span>${esc(state.member.name)}</span></div>`;

  app.innerHTML = topbar(meCard) + `
  <div class="container">
    <div class="trip-head">
      <div>
        <h1>${esc(t.name)}</h1>
        <div class="meta">${t.description ? esc(t.description) + ' · ' : ''}${
          t.start_date ? esc(fmtRange(t.start_date, t.end_date)) + ' · ' : ''
        }${d.members.length} traveler${d.members.length === 1 ? '' : 's'}</div>
      </div>
      <div class="share-pill" data-act="copy-share" title="Click to copy invite link">
        <span class="faint">CODE</span><code>${esc(t.share_code)}</code><span class="faint">📋</span>
      </div>
    </div>

    <div class="tabs">
      ${TABS.map(([k, label]) => {
        const c = tabCount(k);
        return `<button class="tab ${state.tab === k ? 'active' : ''}" data-tab="${k}">${label}${
          c ? `<span class="badge">${c}</span>` : ''
        }</button>`;
      }).join('')}
    </div>

    <div id="tabview">${renderTab()}</div>
  </div>`;
}

function renderTab() {
  switch (state.tab) {
    case 'overview': return tabOverview();
    case 'destinations': return tabDestinations();
    case 'dates': return tabDates();
    case 'budget': return tabBudget();
    case 'expenses': return tabExpenses();
    case 'itinerary': return tabItinerary();
    case 'tasks': return tabTasks();
    case 'people': return tabPeople();
    default: return '';
  }
}

/* ---- Overview ---- */
function tabOverview() {
  const d = state.data;
  const chosen = d.destinations.find((x) => x.id === d.trip.chosen_destination_id);
  const topDest = [...d.destinations].sort((a, b) => b.voters.length - a.voters.length)[0];
  const bestDate = [...d.dateOptions]
    .map((o) => ({ o, yes: o.votes.filter((v) => v.response === 'yes').length }))
    .sort((a, b) => b.yes - a.yes)[0];
  const openTasks = d.tasks.filter((t) => !t.done).length;
  const spent = d.settlement.totalSpent;
  const myBal = d.settlement.balances.find((b) => b.memberId === state.member.id)?.balance || 0;

  const cards = [
    ['📍 Destination', chosen ? esc(chosen.name) : topDest ? `${esc(topDest.name)} <span class="muted">(leading)</span>` : 'Not decided', chosen ? 'Locked in' : `${d.destinations.length} idea${d.destinations.length === 1 ? '' : 's'}`],
    ['📅 Dates', d.trip.start_date ? esc(fmtRange(d.trip.start_date, d.trip.end_date)) : bestDate ? esc(fmtRange(bestDate.o.start_date, bestDate.o.end_date)) + ' <span class="muted">(top)</span>' : 'TBD', `${d.dateOptions.length} option${d.dateOptions.length === 1 ? '' : 's'}`],
    ['🧾 Total spent', money(spent), `across ${d.expenses.length} expense${d.expenses.length === 1 ? '' : 's'}`],
    ['💸 Your balance', `<span class="${myBal >= 0 ? 'bal-pos' : 'bal-neg'}">${myBal >= 0 ? '+' : ''}${money(myBal)}</span>`, myBal >= 0 ? "you're owed" : 'you owe'],
  ];

  return `
  ${chosen ? `<div class="winner-banner">🎉 <b>${esc(chosen.name)}</b> is the chosen destination! Time to make it happen.</div>` : ''}
  <div class="stat-grid">
    ${cards.map(([k, v, s]) => `<div class="stat"><div class="k">${k}</div><div class="bigstat" style="font-size:22px">${v}</div><div class="muted" style="font-size:13px">${s}</div></div>`).join('')}
  </div>

  <div class="grid-2">
    <div class="panel">
      <div class="panel-head"><h2><span class="ico">🗺️</span> Up next</h2><button class="btn sm" data-tab="itinerary">Open itinerary</button></div>
      ${d.itinerary.length ? d.itinerary.slice(0, 5).map((it) => `
        <div class="it-item"><div class="time">${esc(it.day || '')}${it.time ? ' ' + esc(it.time) : ''}</div>
        <div class="grow"><div class="title">${esc(it.title)}</div>${it.location ? `<div class="desc">📍 ${esc(it.location)}</div>` : ''}</div></div>
      `).join('') : `<div class="empty">No itinerary items yet.</div>`}
    </div>
    <div class="panel">
      <div class="panel-head"><h2><span class="ico">✅</span> Open tasks <span class="badge">${openTasks}</span></h2><button class="btn sm" data-tab="tasks">Open tasks</button></div>
      ${d.tasks.filter((t) => !t.done).slice(0, 6).map((t) => {
        const a = d.members.find((m) => m.id === t.assigned_to);
        return `<div class="task"><div class="checkbox" data-act="toggle-task" data-id="${t.id}"></div><div class="grow title">${esc(t.title)}</div>${a ? avatar(a) : ''}</div>`;
      }).join('') || `<div class="empty">Nothing to do — nice. 🎉</div>`}
    </div>
  </div>`;
}

/* ---- Destinations ---- */
function tabDestinations() {
  const d = state.data;
  const sorted = [...d.destinations].sort((a, b) => b.voters.length - a.voters.length);
  const maxVotes = sorted[0]?.voters.length || 0;
  return `
  <div class="panel">
    <div class="panel-head"><h2><span class="ico">🗳️</span> Where should we go?</h2></div>
    <form data-form="destination" class="row" style="align-items:flex-end">
      <label class="field" style="flex:2"><span>Destination</span><input name="name" placeholder="Lisbon, Portugal" required maxlength="80" /></label>
      <label class="field" style="flex:1"><span>Est. cost / person</span><input name="estCost" type="number" min="0" step="any" placeholder="1200" /></label>
      <label class="field" style="flex:3"><span>Why? (optional)</span><input name="description" placeholder="Cheap flights, great food, beaches nearby" maxlength="200" /></label>
      <button class="btn primary" type="submit" style="flex:none;margin-bottom:12px">+ Add</button>
    </form>
  </div>
  <div class="panel">
    ${sorted.length ? sorted.map((dest) => {
      const voted = dest.voters.includes(state.member.id);
      const isLeader = maxVotes > 0 && dest.voters.length === maxVotes;
      const isChosen = dest.id === d.trip.chosen_destination_id;
      return `
      <div class="item ${isLeader ? 'leader' : ''}" style="${isLeader ? 'padding-left:12px;border-radius:10px' : ''}">
        <div class="vote-box">
          <button class="vote-btn ${voted ? 'voted' : ''}" data-act="vote-dest" data-id="${dest.id}" title="${voted ? 'Remove vote' : 'Vote'}">▲</button>
          <span class="vote-count">${dest.voters.length}</span>
        </div>
        <div class="grow">
          <div class="title">${esc(dest.name)} ${isChosen ? '<span class="tag" style="color:var(--accent);border-color:var(--accent)">CHOSEN</span>' : isLeader && maxVotes ? '<span class="tag">leading</span>' : ''}</div>
          ${dest.description ? `<div class="desc">${esc(dest.description)}</div>` : ''}
          <div class="faint" style="font-size:12px;margin-top:4px">${dest.est_cost ? '~' + money(dest.est_cost) + '/person' : ''}</div>
        </div>
        <div class="flex">
          <button class="btn sm ${isChosen ? '' : 'ghost'}" data-act="choose-dest" data-id="${isChosen ? '' : dest.id}">${isChosen ? '✓ Chosen' : 'Choose'}</button>
          <button class="iconbtn" data-act="del-dest" data-id="${dest.id}" title="Delete">✕</button>
        </div>
      </div>`;
    }).join('') : `<div class="empty">No ideas yet — be the first to suggest a destination! ✨</div>`}
  </div>`;
}

/* ---- Dates ---- */
function tabDates() {
  const d = state.data;
  const opts = d.dateOptions;
  return `
  <div class="panel">
    <div class="panel-head"><h2><span class="ico">📅</span> When works for everyone?</h2></div>
    <form data-form="date" class="row" style="align-items:flex-end">
      <label class="field"><span>From</span><input name="startDate" type="date" required /></label>
      <label class="field"><span>To</span><input name="endDate" type="date" required /></label>
      <button class="btn primary" type="submit" style="flex:none;margin-bottom:12px">+ Add option</button>
    </form>
  </div>
  <div class="panel" style="overflow-x:auto">
    ${opts.length ? `
    <table class="date-grid">
      <thead><tr><th>Date range</th><th>👍 Yes</th><th>🤔 Maybe</th><th>👎 No</th><th>You</th><th></th></tr></thead>
      <tbody>
        ${opts.map((o) => {
          const counts = { yes: 0, maybe: 0, no: 0 };
          o.votes.forEach((v) => counts[v.response]++);
          const mine = o.votes.find((v) => v.member_id === state.member.id)?.response;
          const isWinner = counts.yes === Math.max(...opts.map((x) => x.votes.filter((v) => v.response === 'yes').length)) && counts.yes > 0;
          const isSet = d.trip.start_date === o.start_date && d.trip.end_date === o.end_date;
          return `<tr>
            <td><b>${esc(fmtRange(o.start_date, o.end_date))}</b> ${isWinner ? '<span class="tag">top</span>' : ''} ${isSet ? '<span class="tag" style="color:var(--accent)">set</span>' : ''}</td>
            <td><span class="bal-pos">${counts.yes}</span></td>
            <td><span style="color:var(--warn)">${counts.maybe}</span></td>
            <td><span class="bal-neg">${counts.no}</span></td>
            <td><div class="resp">
              ${['yes', 'maybe', 'no'].map((r) => `<button class="${mine === r ? 'on ' + r : ''}" data-act="vote-date" data-id="${o.id}" data-resp="${r}" title="${r}">${{ yes: '👍', maybe: '🤔', no: '👎' }[r]}</button>`).join('')}
            </div></td>
            <td class="nowrap"><button class="btn sm ghost" data-act="set-dates" data-id="${o.id}">Set</button> <button class="iconbtn" data-act="del-date" data-id="${o.id}">✕</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : `<div class="empty">Propose a date range and let everyone weigh in.</div>`}
  </div>`;
}

/* ---- Budget ---- */
function tabBudget() {
  const d = state.data;
  const n = d.members.length || 1;
  const total = d.budgetItems.reduce((s, b) => s + (b.per_person ? b.amount * n : b.amount), 0);
  const target = d.trip.budget_total;
  const spent = d.settlement.totalSpent;
  const byCat = {};
  d.budgetItems.forEach((b) => {
    const amt = b.per_person ? b.amount * n : b.amount;
    byCat[b.category] = (byCat[b.category] || 0) + amt;
  });
  const pct = target ? Math.min(100, (total / target) * 100) : 0;
  const spentPct = target ? Math.min(100, (spent / target) * 100) : 0;
  return `
  <div class="stat-grid">
    <div class="stat"><div class="k">Target budget</div><div class="bigstat">${target ? money(target) : '—'}</div>
      <form data-form="budget-target" class="flex" style="margin-top:8px;gap:6px">
        <input name="budget_total" type="number" min="0" step="any" placeholder="Set target" value="${target ?? ''}" style="padding:6px 8px"/>
        <button class="btn sm" type="submit">Save</button>
      </form>
    </div>
    <div class="stat"><div class="k">Planned total</div><div class="bigstat">${money(total)}</div>
      ${target ? `<div class="bar ${total > target ? 'over' : ''}"><i style="width:${pct}%"></i></div><div class="muted" style="font-size:12px;margin-top:4px">${money(total)} of ${money(target)}</div>` : '<div class="muted" style="font-size:13px">set a target to track</div>'}
    </div>
    <div class="stat"><div class="k">Actually spent</div><div class="bigstat">${money(spent)}</div>
      ${target ? `<div class="bar ${spent > target ? 'over' : ''}"><i style="width:${spentPct}%"></i></div>` : ''}
    </div>
    <div class="stat"><div class="k">Per person (planned)</div><div class="bigstat">${money(total / n)}</div><div class="muted" style="font-size:13px">${n} traveler${n === 1 ? '' : 's'}</div></div>
  </div>

  <div class="panel">
    <div class="panel-head"><h2><span class="ico">💰</span> Budget breakdown</h2></div>
    <form data-form="budget" class="row" style="align-items:flex-end">
      <label class="field" style="flex:2"><span>Item</span><input name="label" placeholder="Round-trip flights" required maxlength="80"/></label>
      <label class="field"><span>Category</span>
        <select name="category">${['Flights', 'Accommodation', 'Food', 'Transport', 'Activities', 'Other'].map((c) => `<option>${c}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Amount</span><input name="amount" type="number" min="0" step="any" placeholder="450" required/></label>
      <label class="field" style="flex:none"><span>Per&nbsp;person?</span><select name="perPerson"><option value="false">No (total)</option><option value="true">Yes</option></select></label>
      <button class="btn primary" type="submit" style="flex:none;margin-bottom:12px">+ Add</button>
    </form>
    ${d.budgetItems.length ? d.budgetItems.map((b) => `
      <div class="item">
        <div class="grow"><div class="title">${esc(b.label)} <span class="tag">${esc(b.category)}</span></div>
        <div class="desc">${b.per_person ? `${money(b.amount)} × ${n} people` : 'total'}</div></div>
        <div class="right"><div class="title">${money(b.per_person ? b.amount * n : b.amount)}</div></div>
        <button class="iconbtn" data-act="del-budget" data-id="${b.id}">✕</button>
      </div>`).join('') : `<div class="empty">Add your expected costs to plan the budget.</div>`}
  </div>`;
}

/* ---- Expenses ---- */
function tabExpenses() {
  const d = state.data;
  const opts = d.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  const checks = d.members.map((m) => `
    <label class="check-row"><input type="checkbox" name="participant" value="${m.id}" checked/> ${avatar(m)} ${esc(m.name)}</label>`).join('');
  return `
  <div class="grid-2">
    <div>
      <div class="panel">
        <div class="panel-head"><h2><span class="ico">🧾</span> Add an expense</h2></div>
        <form data-form="expense">
          <label class="field"><span>What for?</span><input name="description" placeholder="Airbnb deposit" required maxlength="80"/></label>
          <div class="row">
            <label class="field"><span>Amount</span><input name="amount" type="number" min="0.01" step="any" placeholder="320" required/></label>
            <label class="field"><span>Category</span><select name="category">${['Accommodation', 'Food', 'Transport', 'Activities', 'Flights', 'Other'].map((c) => `<option>${c}</option>`).join('')}</select></label>
          </div>
          <label class="field"><span>Paid by</span><select name="paidBy">${opts}</select></label>
          <label class="field"><span>Split between</span></label>
          <div class="check-list">${checks}</div>
          <button class="btn primary block mt" type="submit">Add expense</button>
        </form>
      </div>
    </div>
    <div>
      <div class="panel">
        <div class="panel-head"><h2><span class="ico">💸</span> Settle up</h2><span class="muted">${money(d.settlement.totalSpent)} total</span></div>
        ${d.settlement.transfers.length ? d.settlement.transfers.map((tr) => {
          const from = d.members.find((m) => m.id === tr.from);
          const to = d.members.find((m) => m.id === tr.to);
          return `<div class="transfer">${avatar(from)} <b>${esc(from?.name)}</b> <span class="arrow">→</span> ${avatar(to)} <b>${esc(to?.name)}</b> <span class="grow right bal-neg">${money(tr.amount)}</span></div>`;
        }).join('') : `<div class="empty">All square — nobody owes anything. 🙌</div>`}
        <hr class="sep"/>
        <div class="muted" style="font-size:13px;margin-bottom:8px">Balances</div>
        ${d.settlement.balances.map((b) => {
          const m = d.members.find((x) => x.id === b.memberId);
          return `<div class="flex between" style="padding:4px 0">${avatar(m)} <span class="grow">${esc(m?.name)}</span> <span class="${b.balance >= 0 ? 'bal-pos' : 'bal-neg'}">${b.balance >= 0 ? '+' : ''}${money(b.balance)}</span></div>`;
        }).join('')}
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head"><h2>All expenses</h2></div>
    ${d.expenses.length ? d.expenses.map((e) => {
      const payer = d.members.find((m) => m.id === e.paid_by);
      return `<div class="item">
        ${payer ? avatar(payer) : ''}
        <div class="grow"><div class="title">${esc(e.description)} <span class="tag">${esc(e.category)}</span></div>
        <div class="desc">${esc(payer?.name || '?')} paid · split ${e.splits.length} way${e.splits.length === 1 ? '' : 's'}</div></div>
        <div class="title nowrap">${money(e.amount)}</div>
        <button class="iconbtn" data-act="del-expense" data-id="${e.id}">✕</button>
      </div>`;
    }).join('') : `<div class="empty">No expenses logged yet.</div>`}
  </div>`;
}

/* ---- Itinerary ---- */
function tabItinerary() {
  const d = state.data;
  const groups = {};
  d.itinerary.forEach((it) => { (groups[it.day || 'Unscheduled'] ||= []).push(it); });
  const keys = Object.keys(groups);
  return `
  <div class="panel">
    <div class="panel-head"><h2><span class="ico">🗺️</span> Build the itinerary</h2></div>
    <form data-form="itinerary" class="row" style="align-items:flex-end">
      <label class="field" style="flex:none"><span>Day</span><input name="day" placeholder="Day 1" maxlength="30" style="width:90px"/></label>
      <label class="field" style="flex:none"><span>Time</span><input name="time" type="time" style="width:120px"/></label>
      <label class="field" style="flex:2"><span>Activity</span><input name="title" placeholder="Sunset at Miradouro" required maxlength="100"/></label>
      <label class="field" style="flex:1"><span>Location</span><input name="location" placeholder="Alfama" maxlength="80"/></label>
      <button class="btn primary" type="submit" style="flex:none;margin-bottom:12px">+ Add</button>
    </form>
  </div>
  ${keys.length ? keys.map((day) => `
    <div class="panel day-group">
      <div class="day-label">${esc(day)}</div>
      ${groups[day].map((it) => `
        <div class="it-item">
          <div class="time">${esc(it.time || '—')}</div>
          <div class="grow"><div class="title">${esc(it.title)}</div>
          ${it.location ? `<div class="desc">📍 ${esc(it.location)}</div>` : ''}
          ${it.notes ? `<div class="desc">${esc(it.notes)}</div>` : ''}</div>
          <button class="iconbtn" data-act="del-itinerary" data-id="${it.id}">✕</button>
        </div>`).join('')}
    </div>`).join('') : `<div class="panel"><div class="empty">No plans yet. Add activities to shape each day.</div></div>`}`;
}

/* ---- Tasks ---- */
function tabTasks() {
  const d = state.data;
  const opts = `<option value="">Unassigned</option>` + d.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  return `
  <div class="panel">
    <div class="panel-head"><h2><span class="ico">✅</span> Shared to-do & packing list</h2></div>
    <form data-form="task" class="row" style="align-items:flex-end">
      <label class="field" style="flex:3"><span>Task</span><input name="title" placeholder="Book the rental car" required maxlength="100"/></label>
      <label class="field"><span>Assign to</span><select name="assignedTo">${opts}</select></label>
      <button class="btn primary" type="submit" style="flex:none;margin-bottom:12px">+ Add</button>
    </form>
    ${d.tasks.length ? d.tasks.map((t) => {
      const a = d.members.find((m) => m.id === t.assigned_to);
      return `<div class="task ${t.done ? 'done' : ''}">
        <div class="checkbox ${t.done ? 'on' : ''}" data-act="toggle-task" data-id="${t.id}">${t.done ? '✓' : ''}</div>
        <div class="grow title">${esc(t.title)}</div>
        ${a ? `<span class="chip">${avatar(a)} ${esc(a.name)}</span>` : '<span class="tag">unassigned</span>'}
        <button class="iconbtn" data-act="del-task" data-id="${t.id}">✕</button>
      </div>`;
    }).join('') : `<div class="empty">No tasks yet. Add the things that need doing before you go.</div>`}
  </div>`;
}

/* ---- People ---- */
function tabPeople() {
  const d = state.data;
  return `
  <div class="panel">
    <div class="panel-head"><h2><span class="ico">👥</span> Travelers</h2>
      <div class="share-pill" data-act="copy-share" title="Copy invite link"><span class="faint">Invite code</span><code>${esc(d.trip.share_code)}</code><span class="faint">📋</span></div>
    </div>
    ${d.members.map((m) => `
      <div class="item">
        ${avatar(m, 'lg')}
        <div class="grow"><div class="title">${esc(m.name)} ${m.is_organizer ? '<span class="tag">organizer</span>' : ''} ${m.id === state.member.id ? '<span class="tag" style="color:var(--accent)">you</span>' : ''}</div></div>
        ${m.id !== state.member.id && !m.is_organizer ? `<button class="iconbtn" data-act="del-member" data-id="${m.id}">✕</button>` : ''}
      </div>`).join('')}
    <form data-form="member" class="row mt" style="align-items:flex-end">
      <label class="field" style="flex:1"><span>Add someone manually</span><input name="name" placeholder="Their name" required maxlength="40"/></label>
      <button class="btn" type="submit" style="flex:none;margin-bottom:12px">+ Add person</button>
    </form>
    <hr class="sep"/>
    <div class="flex between">
      <span class="muted">Signed in as <b>${esc(state.member.name)}</b> on this device.</span>
      <button class="btn sm ghost" data-act="switch-identity">Switch person</button>
    </div>
  </div>`;
}

/* ----------------------------- events --------------------------------- */
const formData = (form) => {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      if (el.name === 'participant') { (o.participants ||= []).push(...(el.checked ? [el.value] : [])); }
      else o[el.name] = el.checked;
    } else o[el.name] = el.value;
  }
  return o;
};

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form;
  const f = formData(form);
  const tripId = state.trip?.id;
  try {
    switch (kind) {
      case 'create': {
        const r = await api.post('/trips', f);
        saveMember(r.trip.id, r.member);
        location.hash = `#/trip/${r.trip.share_code}`;
        toast('Trip created! Share the code with your group.');
        return;
      }
      case 'join': {
        const code = f.code.trim().toUpperCase();
        const r = await api.post(`/trips/${encodeURIComponent(code)}/members`, { name: f.name });
        const trip = await api.get(`/trips/${encodeURIComponent(code)}`);
        saveMember(trip.trip.id, r.member);
        location.hash = `#/trip/${code}`;
        return;
      }
      case 'joincurrent': {
        const r = await api.post(`/trips/${state.trip.id}/members`, { name: f.name });
        saveMember(state.trip.id, r.member);
        state.member = r.member;
        await refresh();
        toast(`Welcome aboard, ${r.member.name}!`);
        return;
      }
      case 'destination':
        await api.post(`/trips/${tripId}/destinations`, { ...f, estCost: f.estCost ? Number(f.estCost) : null, proposedBy: state.member.id });
        break;
      case 'date':
        if (f.endDate < f.startDate) return toast('End date must be after the start date.', true);
        await api.post(`/trips/${tripId}/dates`, f);
        break;
      case 'budget-target':
        await api.patch(`/trips/${tripId}`, { budget_total: f.budget_total ? Number(f.budget_total) : null });
        toast('Budget target saved.');
        break;
      case 'budget':
        await api.post(`/trips/${tripId}/budget`, { ...f, amount: Number(f.amount), perPerson: f.perPerson === 'true' });
        break;
      case 'expense':
        await api.post(`/trips/${tripId}/expenses`, { ...f, amount: Number(f.amount) });
        toast('Expense added.');
        break;
      case 'itinerary':
        await api.post(`/trips/${tripId}/itinerary`, f);
        break;
      case 'task':
        await api.post(`/trips/${tripId}/tasks`, f);
        break;
      case 'member':
        await api.post(`/trips/${tripId}/members`, f);
        break;
    }
    form.reset();
    await refresh();
  } catch (err) {
    toast(err.message, true);
  }
});

document.addEventListener('click', async (e) => {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { state.tab = tabBtn.dataset.tab; render(); return; }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  const tripId = state.trip?.id;
  try {
    switch (act) {
      case 'home': location.hash = '#/'; return;
      case 'copy-share': {
        const url = `${location.origin}/#/trip/${state.trip.share_code}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        toast('Invite link copied to clipboard!');
        return;
      }
      case 'vote-dest':
        await api.post(`/destinations/${id}/vote`, { memberId: state.member.id });
        await refresh(); return;
      case 'choose-dest':
        await api.patch(`/trips/${tripId}`, { chosen_destination_id: id || null });
        toast(id ? 'Destination locked in! 🎉' : 'Choice cleared.');
        await refresh(); return;
      case 'del-dest':
        if (!confirm('Delete this destination?')) return;
        await api.del(`/destinations/${id}`); await refresh(); return;
      case 'vote-date':
        await api.post(`/dates/${id}/vote`, { memberId: state.member.id, response: el.dataset.resp });
        await refresh(); return;
      case 'set-dates': {
        const o = state.data.dateOptions.find((x) => x.id === id);
        await api.patch(`/trips/${tripId}`, { start_date: o.start_date, end_date: o.end_date });
        toast('Trip dates set!'); await refresh(); return;
      }
      case 'del-date': await api.del(`/dates/${id}`); await refresh(); return;
      case 'del-budget': await api.del(`/budget/${id}`); await refresh(); return;
      case 'del-expense':
        if (!confirm('Delete this expense?')) return;
        await api.del(`/expenses/${id}`); await refresh(); return;
      case 'del-itinerary': await api.del(`/itinerary/${id}`); await refresh(); return;
      case 'toggle-task': {
        const t = state.data.tasks.find((x) => x.id === id);
        await api.patch(`/tasks/${id}`, { done: !t.done }); await refresh(); return;
      }
      case 'del-task': await api.del(`/tasks/${id}`); await refresh(); return;
      case 'del-member':
        if (!confirm('Remove this person from the trip?')) return;
        await api.del(`/members/${id}`); await refresh(); return;
      case 'switch-identity':
        localStorage.removeItem(memberKey(state.trip.id));
        state.member = null; render(); return;
    }
  } catch (err) { toast(err.message, true); }
});

/* assignment changes via select in tasks list (none currently inline) */

/* ----------------------------- boot ----------------------------------- */
navigate();
