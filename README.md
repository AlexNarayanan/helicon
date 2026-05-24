# Helicon

Self-hosted concert-attendance tracker enriched with [setlist.fm](https://www.setlist.fm/) data. Single sentinel user (no auth). Tracks attended and planned shows, pulls the full lineup automatically, and visualizes history via timeline, map, and aggregate reports.

**Note: this repo uses Podman, not Docker.** Use `podman compose` locally; CI uses Docker.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend/server | SvelteKit + TypeScript, adapter-node | Svelte's reactivity and `tweened` stores make D3/SVG animation natural; no virtual-DOM fight |
| Database | Postgres 16 + Drizzle ORM | Window functions and CTEs for aggregates; Drizzle gives type-safe SQL without hiding it |
| Styling | Tailwind + CSS custom properties | 4 theme palettes via CSS vars; no JS theme switching |
| Charts | LayerChart + D3 | LayerChart for composable Svelte chart primitives; raw D3 for the animated helicon icon |
| Map | MapLibre GL JS + OSM tiles | No API key; open-source; self-hostable tile server later |
| Testing | Vitest + Playwright + Testcontainers | Fully headless; no mocks for the DB layer — real Postgres per test file |

---

## Data model

```
users        sentinel row only (MVP; id=1 hardcoded in routes)
artists      globally deduplicated by setlistfm_mbid
venues       globally deduplicated by setlistfm_id; lat/lng cached
tours        (artist_id, name) unique
shows        (venue_id, show_date) unique — one real-world event
performances (show_id, artist_id) unique — one row per artist per show
             billing_order: 0=first support … N=headliner
             raw_json: full setlist.fm payload for re-derivation
attendances  (user_id, show_id) unique — status: confirmed | planned
songs        (artist_id, normalized_name) unique
setlist_songs → performance (not setlist); covers link to cover_artist_id
```

**Key design decisions**

- `performances` is symmetric — opener and headliner are equal rows, so "most-seen artist" and "songs heard across all support sets" are plain GROUP BYs.
- `raw_json` stores the full setlist.fm payload so structured data can be re-derived without re-hitting the API.
- Global deduplication of artists/venues/songs means aggregations across attendances are trivial joins.
- Billing order is a heuristic: setlists sorted by `lastUpdated` ascending (headliners are edited last/most). Reorder UI is a tracked follow-up.

---

## Attendance create flow

1. User searches for an artist + date; server calls setlist.fm.
2. On selection, server fetches the seed setlist, extracts `venue.id` + `eventDate`.
3. Calls `searchSetlists({ venueId, date })` and pages through results (cap: 5 pages / 250 setlists).
4. Upserts `venue`, `show`, `artist`, `tour`, `performance`, and `setlist_songs` for every discovered artist at that venue+date.
5. Upserts the `attendance` row. Returns `{ attendanceId, showId, performanceCount }`.

The seed artist is explicitly merged if missing from venue+date results (rare API inconsistency).

**Planned shows:** when `show_date` passes, a "Fetch setlist" button calls the resync endpoint and sets `attendance_status = confirmed`.

---

## setlist.fm client

- Rate-limited to 2 req/s (token bucket).
- In-memory LRU cache to avoid repeat fetches within a session.
- Automatic retries with exponential backoff on 429/5xx.

---

## Test architecture

- **Testcontainers**: fresh Postgres per test file; migrations applied on spin-up. No mocks for the DB layer.
- **MSW**: intercepts setlist.fm HTTP with fixture JSON checked into `tests/fixtures/setlistfm/`.
- **Playwright E2E**: also uses MSW via `page.route()`, so no real network calls.
- Fixed timestamps via an injected `Clock` interface (not yet wired everywhere — tracked TODO).

---

## Dev setup

```bash
cp .env.example .env          # fill in SETLISTFM_API_KEY
podman compose up -d postgres
pnpm install
pnpm db:seed                  # migrations + sentinel user (id=1)
pnpm dev                      # http://localhost:7000
```

## Test commands

```bash
pnpm test          # unit
pnpm test:db       # DB integration (Testcontainers)
pnpm test:api      # API integration (Testcontainers + MSW)
pnpm test:e2e      # Playwright E2E
pnpm test:visual   # screenshot regression
pnpm test:smoke    # production image smoke test (podman)
```

## Production deploy

```bash
cp .env.example .env   # set DOMAIN, POSTGRES_PASSWORD, SETLISTFM_API_KEY
podman compose -f compose.prod.yml up -d
```

Caddy obtains a Let's Encrypt cert for `$DOMAIN` automatically. The entrypoint (`scripts/entrypoint.sh`) runs `scripts/seed.mjs` (plain-JS migrator + sentinel insert) then `node build/index.js` on every start.
