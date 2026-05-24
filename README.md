# Helicon

Self-hosted concert-attendance tracker enriched with [setlist.fm](https://www.setlist.fm/) data. Single sentinel user, no auth. Tracks attended and planned shows, pulls full lineup setlists automatically, and visualizes history via timeline, map, and aggregate reports.

## Stack

| Layer | Choice |
|---|---|
| Frontend/server | SvelteKit + TypeScript, adapter-node |
| Database | Postgres 16, Drizzle ORM, drizzle-kit migrations |
| Styling | Tailwind CSS + CSS custom properties (4 themes) |
| Charts | LayerChart + Observable Plot + D3 |
| Map | MapLibre GL JS + OSM tiles |
| Testing | Vitest (unit/db/api), Playwright (e2e/visual), Testcontainers |
| Containers | Podman / Docker Compose (dev: `compose.yml`, prod: `compose.prod.yml` + Caddy) |

**Note: this repo uses Podman, not Docker.** Use `podman compose` locally; CI uses Docker.

## Data model (key tables)

`shows` (venue + date) → `performances` (one row per artist per show, absorbs setlist data) → `attendances` (user × show, status: confirmed/planned). `artists`, `venues`, `songs`, `tours`, `setlist_songs` are globally deduplicated.

## Dev setup

```bash
cp .env.example .env          # fill in SETLISTFM_API_KEY
podman compose up -d postgres
pnpm install
pnpm db:seed                  # migrations + sentinel user
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

Caddy obtains a Let's Encrypt cert for `$DOMAIN` automatically. The entrypoint runs migrations and seeds the sentinel user on each start.
