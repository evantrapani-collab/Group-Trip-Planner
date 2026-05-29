# Market & competitors

A snapshot of where **TripTogether** sits in the group-trip-planning market, who
the closest competitors are, and what makes this app different. (Last reviewed:
2026-05.)

## The short version

The group-travel space is crowded and well-funded, but it's split into two camps
that rarely overlap well:

- **Planners** (Wanderlog, Troupe, TripIt, WePlanify, SquadTrip, AvoSquado) — great
  at itineraries, polls, and maps, but weak on expense settle-up.
- **Money apps** (Splitwise, Venmo) — great at splitting costs, but do no planning,
  voting, or itineraries.

> The most repeated finding across every comparison: *most groups still end up using
> two apps — one for planning, one for money.*

TripTogether deliberately spans both: voting, dates, budget, **Splitwise-style
settle-up**, itinerary, and tasks — with **no accounts and no app install**.

## Closest competitors

| App | What it does | Overlap with TripTogether |
|---|---|---|
| **Troupe** | Voting on destinations & dates, group polls | Direct overlap on destination + date voting — the closest match to our "decide together" core. |
| **Wanderlog** | Collaborative day-by-day itinerary, maps, budget + expense splitting (free) | The all-rounder "gold standard." Overlaps on itinerary, budget, and expense splitting. |
| **Splitwise** | Net balances + minimal settle-up payments | Almost exactly our expenses/settle-up feature (the greedy minimal-transfer math in `server/settle.js`). |
| **WePlanify / SquadTrip / AvoSquado** | All-in-one: polls, shared budget, itinerary, packing lists | Each covers most of our feature set; SquadTrip and WeTravel add payment collection. |
| **TripIt / Travefy** | Itinerary aggregation & sharing | Overlaps on the shared itinerary piece. |

## How TripTogether is different

1. **No accounts, no passwords, no install.** Nearly every competitor requires
   sign-up. Share a 6-letter code, join with just a name. This is the strongest
   wedge — meaningfully lower friction than anything else in the market.
2. **Genuinely all-in-one**, *including* the settle-up math that planners usually
   outsource to Splitwise.
3. **Free and self-hostable.** A single Node/SQLite container you deploy yourself,
   versus SaaS freemium products. Appeals to privacy-conscious users and groups who
   just want a tool for one trip.

## Honest positioning

This is not a blank market — don't try to out-feature Wanderlog. But no single
dominant app owns the intersection of **zero-friction, no-account, all-in-one
including settle-up, and self-hostable.** The realistic pitch:

> *The no-signup, share-a-code app that replaces the planner + Splitwise combo for a
> single group trip.*

## Sources

- [Troupe — group trip planner](https://www.troupe.com/group-travel/group-trip-planner-app/)
- [Wanderlog](https://wanderlog.com/)
- [Best Group Trip Planner Apps (WePlanify)](https://www.weplanify.com/en/alternatives/best-group-trip-planner-apps)
- [Best Group Trip Planning Tools (SquadTrip)](https://www.squadtrip.com/guides/best-tools-for-group-trip-planning/)
- [Best Group Planning Apps (WhenAvailable)](https://whenavailable.com/blog/best-group-planning-apps)
- [Best Group Travel Planning Apps (TripIt)](https://www.tripit.com/web/blog/travel-tips/best-group-travel-planning-app)
- [Best Apps for Group Travel — Plan & Split Bills (Journey)](https://journeywithus.co/blogs/news/best-apps-for-group-travel-with-friends)
