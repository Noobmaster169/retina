# Phase 3: VPS deploy and Vercel

## Goal

The phase 2 system runs on the Monash box and is reachable through the Vercel URL. Every
later phase then ships with `git push`. Doing this while the system is small surfaces
infrastructure problems (tunnel, image size, memory, Averis mount) before they can block a
feature phase.

## Prerequisites

- Phase 2 merged to `main`.
- Retina's box setup already done per `deploy/README.md`: deploy key, `~/retina/.env`, ngrok
  account and static domain, cron lines, GHCR image publishing in GitHub Actions.
- SSH access to `student@118.139.133.14` from the dev machine.

## Scope

In: compose for production, auto-deploy changes, Averis kit on the box, Vercel env, runbook.
Out: pipeline changes of any kind.

## Work items

### 1. `deploy/compose.yaml`

Extend the existing file. Final service list:

```yaml
services:
  postgres:
    image: postgres:17
    environment: { POSTGRES_USER: retina, POSTGRES_PASSWORD: ${PG_PASSWORD}, POSTGRES_DB: retina_prod }
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U retina"], interval: 10s, retries: 10 }
    restart: unless-stopped

  redis:
    image: redis:7
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction", "--maxmemory", "1gb"]
    volumes: [redisdata:/data]
    healthcheck: { test: ["CMD", "redis-cli", "ping"], interval: 10s, retries: 10 }
    restart: unless-stopped

  minio:
    image: minio/minio
    command: ["server", "/data", "--console-address", ":9001"]
    environment: { MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}, MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY} }
    volumes: [miniodata:/data]
    healthcheck: { test: ["CMD", "mc", "ready", "local"], interval: 10s, retries: 10 }
    restart: unless-stopped

  minio-init:
    image: minio/mc
    depends_on: { minio: { condition: service_healthy } }
    entrypoint: >
      /bin/sh -c "mc alias set local http://minio:9000 ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY} &&
                  mc mb --ignore-existing local/retina && exit 0"

  averis:
    build: ./averis/server
    ports: ["127.0.0.1:8080:8000"]
    volumes:
      - ./averis/data_v2:/data:ro
      - ./secrets/ground_truth.json:/secrets/ground_truth.json:ro
    environment: { DATA_DIR: /data, GROUND_TRUTH: /secrets/ground_truth.json }
    restart: unless-stopped

  api:
    image: ghcr.io/noobmaster169/retina-api:main
    env_file: .env
    ports: ["127.0.0.1:8091:8091"]
    extra_hosts: ["host.docker.internal:host-gateway"]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      minio: { condition: service_healthy }
    healthcheck: { test: ["CMD", "wget", "-qO-", "http://localhost:8091/health"], interval: 15s, retries: 5, start_period: 30s }
    restart: unless-stopped

  worker:
    image: ghcr.io/noobmaster169/retina-api:main
    command: ["node", "dist/worker.js"]
    env_file: .env
    extra_hosts: ["host.docker.internal:host-gateway"]
    depends_on:
      api: { condition: service_healthy }
    restart: unless-stopped

volumes: { pgdata: {}, redisdata: {}, miniodata: {} }
```

Notes:

- `~/retina/` on the box holds `compose.yaml`, `.env`, `auto-deploy.sh`, `run-ngrok.sh`,
  `secrets/ground_truth.json`, and a checkout of the repo at `~/projects/retina` from which
  `averis/` is copied (or bind-mounted: `./averis` → `~/projects/retina/emails`). Simplest:
  `auto-deploy.sh` rsyncs `emails/` to `~/retina/averis/` after each pull.
- `LLM_PROXY_URL=http://172.17.0.1:4000` as in Retina today; `extra_hosts` is there in case the
  bridge IP differs.
- The worker waits for `api` healthy because the api runs migrations on boot. Never run
  migrations from two containers.

### 2. Backend Dockerfile

Confirm the existing Dockerfile produces `dist/worker.js` (multi-stage: install, `pnpm build`,
copy `dist` and production `node_modules`). Add `wget` to the runtime image for the healthcheck
if it uses a distroless or alpine base without it. Image size target under 300 MB.

### 3. `deploy/.env.example`

Add every variable from phase 1's `config.ts` with production values:
`DATABASE_URL=postgres://retina:${PG_PASSWORD}@postgres:5432/retina_prod` (compose does not
expand nested variables in `env_file`; write the literal password twice or construct the URL
in `config.ts` from `PG_*` parts. Decision: `config.ts` accepts either `DATABASE_URL` or
`PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_DATABASE` and builds the URL.)
`REDIS_URL=redis://redis:6379`, `MINIO_ENDPOINT=minio:9000`, `EMAIL_SERVER_URL=http://averis:8000`,
`LLM_PROXY_URL=http://172.17.0.1:4000`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` (32 hex each),
plus the two bearer keys already there.

### 4. `deploy/auto-deploy.sh`

Changes to the existing script:

1. After the fast-forward: `rsync -a --delete --exclude ground_truth.json
   ~/projects/retina/emails/ ~/retina/averis/`.
2. `docker compose build averis` only when `emails/server` changed (compare git hash of
   that path stored in `~/retina/.averis-hash`).
3. Pull or build the api image as today; tag the previous image `retina-api:previous`.
4. `docker compose up -d --no-deps api worker` (and `averis` when rebuilt).
5. Health poll: 90 s for `GET /health` returning HTTP 200 with `checks.postgres == "up"` and
   `checks.redis == "up"`. Degraded MinIO or Averis logs a warning but does not roll back.
6. Rollback: retag `previous` as `main`, `up -d --no-deps api worker`, log, exit 1.
7. Log to `~/retina/auto-deploy.log` with timestamps; keep the existing dirty-clone refusal.

### 5. Box steps (once)

```bash
# on the box, as student
cd ~/projects/retina && git pull
mkdir -p ~/retina/secrets ~/retina/backups
cp deploy/{compose.yaml,auto-deploy.sh} ~/retina/
cp deploy/.env.example ~/retina/.env && vi ~/retina/.env       # fill secrets
# from the dev machine: scp the answer key
scp .../data_v2/ground_truth.json student@118.139.133.14:~/retina/secrets/
# back on the box
cd ~/retina && docker compose build averis && docker compose up -d
curl -s 127.0.0.1:8091/health | jq .
curl -s 127.0.0.1:8080/health | jq .                            # {"emails":520,"scoring_available":true}
curl -s https://<domain>.ngrok-free.dev/health | jq .status
```

Add one cron line for backups: `0 3 * * * cd /home/student/retina && docker compose exec -T
postgres pg_dump -U retina retina_prod | gzip > backups/retina_$(date +\%F).sql.gz`.

### 6. Vercel

Project already exists with Root Directory `frontend`. Set or confirm env vars:
`BACKEND_URL=https://<domain>.ngrok-free.dev`, `API_SHARED_SECRET`, `SITE_PASSWORD`,
`SESSION_SECRET`. `api-client.ts` sends `ngrok-skip-browser-warning: 1` on every request so the
free-tier interstitial never appears for server-to-server calls.

### 7. GitHub Actions

Existing workflow type-checks both packages and publishes the image. Add `pnpm test` for the
backend with a Postgres and Redis service container (`services:` block) so repository tests
run in CI. Frontend: `pnpm build` to catch type errors in server components.

### 8. Runbook: `deploy/README.md` additions

- New services and their logs: `docker compose logs -f worker`, `... averis`.
- "Worker stuck": `docker compose restart worker`; stalled jobs recover automatically.
- "Redis full" (noeviction errors): `redis-cli info memory`; raise `--maxmemory` or clear
  completed jobs with `queue.clean`.
- "Averis 503 on submit": ground truth not mounted; check `~/retina/secrets`.
- MinIO console: `ssh -L 9001:localhost:9001 student@...` then `docker compose port minio 9001`
  (or add a temporary `127.0.0.1:9001:9001` mapping; remove after).

## Tests

No new code tests. CI must be green before merge.

## Manual verification

- Start a run from the Vercel page at 2 emails/s; watch counts on the page; confirm on the
  box with `docker compose logs -f worker`.
- Submit from the page; score matches `pnpm eval:score` on the same run locally within
  rounding (same code, same data).
- Push a trivial commit (a log line); within 5 minutes `auto-deploy.log` shows pull, up,
  health ok.
- Break `/health` on purpose in a branch build (return 500), deploy, confirm rollback, revert.

## Exit checklist

- [ ] `https://<domain>/health` reports every check up.
- [ ] A run started from the Vercel page completes on the box and scores through the box's Averis.
- [ ] A push to `main` deploys within 5 minutes without manual steps; rollback tested once.
- [ ] `docker compose ps` on the box shows only `127.0.0.1:8091` and `127.0.0.1:8080` published.
- [ ] `ground_truth.json` exists only under `~/retina/secrets/` and inside the `averis` container.
- [ ] Nightly backup cron line present; one manual `pg_dump` succeeded.
- [ ] `deploy/README.md` updated; `PROGRESS.md` updated.

## Hand-off notes for phase 4

- Before writing phase 4 code, run the day-one checks on the box and record results in
  `PROGRESS.md`: `curl 172.17.0.1:4000/v1/models` for alias names; a request with an image
  content block to see whether the proxy forwards it; 8 parallel requests to check for 429s.
