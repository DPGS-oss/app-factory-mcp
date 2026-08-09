# Scaffold: Docker Compose (local / self-hosted)

Target: the app runs on the user's own machine, home server or VPS - no cloud vendor.
Usually combined with the Next.js PWA template: build the web app, then containerize it.

## Approach

1. Build the app with the `nextjs-pwa` template (set `output: "standalone"` in `next.config.ts`).
2. The App Factory `deploy` tool (target `docker`) generates the `Dockerfile`,
   `.dockerignore` and `docker-compose.yml` automatically.
3. If the app needs a database, extend the generated compose file with a `db` service:

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

## Baseline requirements

- `.env` file holds all secrets; `.env.example` documents them; compose reads via `env_file`.
- Containers run as a non-root user (the generated Dockerfile already does this).
- Data that must survive restarts lives in named volumes - never inside the container.
- Health check: wire the app's `/api/health` endpoint into compose (`healthcheck:`) so
  restarts are automatic.
- Backups: for SQLite copy the db file on a schedule; for Postgres use `pg_dump` cron.
  Document the chosen backup approach in the README.
- If exposed to the internet: put a reverse proxy with HTTPS in front
  (Caddy is the simplest: two-line Caddyfile gives automatic Let's Encrypt certificates).

## Run (deploy tool target: docker)

```bash
docker compose up -d --build   # build and start
docker compose logs -f app     # watch logs
docker compose down            # stop
```
