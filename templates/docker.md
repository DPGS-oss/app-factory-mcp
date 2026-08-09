# Scaffold: Docker Compose (local / self-hosted)

Target: run on the user's machine, NAS, or VPS — no cloud vendor required.  
Usually pairs with `nextjs-pwa` (`output: "standalone"` in `next.config.ts`).

## Approach

1. Build the app with the Next.js PWA template (contracts, env validation, health endpoint).
2. App Factory `deploy` (target `docker`) writes `Dockerfile`, `.dockerignore`, `docker-compose.yml`.
3. If a DB is needed, extend compose:

```yaml
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: app
    volumes:
      - db-data:/var/lib/postgresql/data
volumes:
  db-data:
```

## Baseline

- Secrets in `.env`; document in `.env.example`; compose uses `env_file`.
- Non-root container user (generated Dockerfile does this).
- Persist data in named volumes — never only inside the container filesystem.
- Compose `healthcheck` against `/api/health`.
- Document backups (SQLite file copy or `pg_dump` cron) in README.
- Public internet: reverse proxy + HTTPS (Caddy is simplest).

## Run

```bash
docker compose up -d --build
docker compose logs -f app
docker compose down
```
