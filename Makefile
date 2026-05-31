.PHONY: dev-up dev-down prod-up prod-down prod-logs

dev-up:
	@test -f .env || (echo "ERROR: .env not found — copy .env.example to .env and fill in values" && exit 1)
	podman compose up -d postgres
	@echo "Waiting for postgres..." && until pg_isready -h localhost -p 7001 -U helicon -q 2>/dev/null; do sleep 1; done
	pnpm db:seed
	@if [ -f .dev.pid ] && kill -0 $$(cat .dev.pid) 2>/dev/null; then echo "Dev server already running (PID $$(cat .dev.pid))"; else pnpm dev > /tmp/helicon-dev.log 2>&1 & echo $$! > .dev.pid && echo "Dev server started (PID $$(cat .dev.pid)). Logs: tail -f /tmp/helicon-dev.log"; fi

dev-down:
	@if [ -f .dev.pid ]; then kill $$(cat .dev.pid) 2>/dev/null || true; rm -f .dev.pid; fi
	podman compose down postgres

prod-up:
	@test -f .env.prod || (echo "ERROR: .env.prod not found — copy .env.prod.example to .env.prod and fill in values" && exit 1)
	systemctl --user reset-failed 2>/dev/null || true
	podman compose -f compose.prod.yml --env-file .env.prod up --build -d

prod-down:
	podman compose -f compose.prod.yml --env-file .env.prod down

prod-logs:
	podman compose -f compose.prod.yml --env-file .env.prod logs -f
