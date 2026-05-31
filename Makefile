.PHONY: prod-up prod-down prod-logs

prod-up:
	@test -f .env.prod || (echo "ERROR: .env.prod not found — copy .env.prod.example to .env.prod and fill in values" && exit 1)
	systemctl --user reset-failed 2>/dev/null || true
	podman compose -f compose.prod.yml --env-file .env.prod up --build -d

prod-down:
	podman compose -f compose.prod.yml --env-file .env.prod down

prod-logs:
	podman compose -f compose.prod.yml --env-file .env.prod logs -f
