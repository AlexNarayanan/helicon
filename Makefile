.PHONY: prod-up prod-down prod-logs

prod-up:
	@test -f .env || (echo "ERROR: .env not found — copy .env.example to .env and fill in POSTGRES_PASSWORD and SETLISTFM_API_KEY" && exit 1)
	podman compose -f compose.prod.yml up --build -d

prod-down:
	podman compose -f compose.prod.yml down

prod-logs:
	podman compose -f compose.prod.yml logs -f
