.PHONY: dev-up dev-down prod-up prod-down prod-logs

dev-up:
	@test -f .env || (echo "ERROR: .env not found — copy .env.example to .env and fill in values" && exit 1)
	podman compose up -d postgres
	tmux new-session -d -s helicon-dev -c $(PWD) 'pnpm dev; read' 2>/dev/null || true

dev-down:
	tmux kill-session -t helicon-dev 2>/dev/null || true
	podman compose stop postgres

prod-up:
	@test -f .env.prod || (echo "ERROR: .env.prod not found — copy .env.prod.example to .env.prod and fill in values" && exit 1)
	systemctl --user reset-failed 2>/dev/null || true
	podman compose -f compose.prod.yml --env-file .env.prod up --build -d

prod-down:
	podman compose -f compose.prod.yml --env-file .env.prod down

prod-logs:
	podman compose -f compose.prod.yml --env-file .env.prod logs -f
