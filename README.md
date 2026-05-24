# Helicon

Self-hosted concert-attendance tracker with setlist data from [setlist.fm](https://www.setlist.fm/).

## Quick start (development)

```bash
cp .env .env            # already committed with dev defaults
docker compose up -d postgres
pnpm install
pnpm db:seed            # runs migrations + inserts sentinel user
pnpm dev                # http://localhost:7000
```

## One-command production deploy

### Prerequisites

- A VPS with Docker and Docker Compose v2 installed
- A domain pointed at the server's IP
- A [setlist.fm API key](https://www.setlist.fm/settings/api)

### Steps

1. **Clone the repo onto the server**

   ```bash
   git clone https://github.com/AlexNarayanan/helicon.git
   cd helicon
   ```

2. **Create a `.env` file**

   ```bash
   cp .env.example .env
   ```

   Fill in:

   | Variable            | Description                                        |
   |---------------------|----------------------------------------------------|
   | `DOMAIN`            | Your domain, e.g. `helicon.example.com`            |
   | `POSTGRES_PASSWORD` | A strong random password for the database          |
   | `SETLISTFM_API_KEY` | Your setlist.fm API key                            |

3. **Start the stack**

   ```bash
   docker compose -f compose.prod.yml up -d
   ```

   On first boot the app automatically runs database migrations, seeds the
   sentinel user, and starts. Caddy obtains a Let's Encrypt certificate for
   your domain automatically.

4. **Verify**

   ```bash
   curl https://<your-domain>/api/health
   # {"status":"ok","timestamp":"..."}
   ```

### Updates

```bash
git pull
docker compose -f compose.prod.yml build
docker compose -f compose.prod.yml up -d
```

## Architecture

| Component  | Role                                      |
|------------|-------------------------------------------|
| **SvelteKit** | Full-stack web app (adapter-node)      |
| **Postgres 16** | Attendance, setlist, and venue data  |
| **Caddy 2**  | Reverse proxy with automatic HTTPS      |
| **setlist.fm** | Setlist data API (rate-limited 2 r/s) |

## Development commands

```bash
pnpm dev            # dev server
pnpm check          # type-check
pnpm lint           # eslint
pnpm test           # unit tests
pnpm test:db        # DB integration tests (requires Docker)
pnpm test:api       # API integration tests
pnpm test:e2e       # Playwright E2E tests
pnpm test:smoke     # production image smoke test (requires Docker)
```
