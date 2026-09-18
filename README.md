# Retina

Three packages in one repo:

```
browser → frontend (Next.js) → backend api (Express + Postgres) → proxy (Python) → claude -p / Ollama
                                        ↓ Redis queues          ↘ email server (Python) → emails/data_v2
                               backend worker → MinIO (attachments)
```

| Folder | What it is | Port |
| --- | --- | --- |
| `frontend/` | Next.js app. Calls the backend with a shared secret. | 3000 |
| `backend/` | Express API, plus a worker process that runs the pipeline off Redis queues. | 8091 |
| `proxy/` | Small LLM gateway. Runs `claude -p` (your Claude Code login) or Ollama. | 4000 |
| `emails/` | The inbox: a FastAPI server over the synthetic shipping-documents dataset. The backend reads it. | 8080 |
| `deploy/` | Scripts and runbook for the Monash server. | — |

Each package has its own deps, `.env` and start command. Always `cd` into a
package first. Nothing runs from the repo root.

## You need

- Node 24 and pnpm 11 (`corepack enable`)
- Docker (for the local Postgres, Redis, MinIO and the email server)
- Python 3.10+
- Claude Code, logged in. `claude -p "say ok"` must print ok.
- Optional: Ollama with `qwen3:14b` pulled, for the `qwen*` aliases.

## Run it

Four terminals, in this order. The email server no longer needs its own: the
backend's local compose file runs it.

**1. Proxy**

```bash
cd proxy
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
./start.sh
```

**2. Backend**

```bash
cd backend
cp .env.example .env
docker compose -f compose.local.yaml up -d      # Postgres 5433, Redis 6379, MinIO 9000, email server 8080
pnpm install && pnpm db:migrate && pnpm dev     # the api
```

**3. Worker**, a second terminal in `backend/`. It consumes the queues; without it a
run is created and never moves.

```bash
cd backend
pnpm dev:worker
```

`emails/docker-compose.yml` starts the same email server on the same port. Use it
when you want only the inbox; do not run both.

**4. Frontend**

```bash
cd frontend
cp .env.example .env.local
pnpm install && pnpm dev
```

Open http://localhost:3000: the inbox, public, straight from the email
server through the backend. http://localhost:3000/chat is the model page:
pick `test`, send `ping`, get `echo: ping`. Pick `haiku`, send anything, get
a real answer from Claude. http://localhost:3000/runs starts a pipeline run and
shows its emails moving through the stages.

The default keys in the two `.env.example` files match each other. Change
them if you want, but change both.

### Use the deployed backend instead of a local one

In `frontend/.env.local` set `BACKEND_URL=https://purebred-shank-riptide.ngrok-free.dev`
and `API_SHARED_SECRET` to the production value (ask the box owner). Then you
only need terminal 4.

## Models

Aliases are model names. They live in `proxy/proxy.yaml`.

| Alias | Runs on | Needs |
| --- | --- | --- |
| `sonnet`, `opus`, `haiku` | Claude Code subscription | `claude` logged in |
| `qwen3:14b`, `qwen3:4b`, `qwen3.8:27b` | Ollama | model pulled |
| `test` | nothing | nothing |

Use `qwen3:14b`, not `qwen3:4b`. The 4B model writes its reasoning into the
answer. `costUsd` on Claude calls is what the API would have charged. Nothing
is billed.

## API

All routes except `/health` need `Authorization: Bearer <key>`. The key is
`API_SHARED_SECRET` (frontend) or `TEAM_API_KEY` (you, curl, scripts).

| Route | Body → Result |
| --- | --- |
| `GET /health` | `{ status: "ok" \| "degraded", checks: { postgres, redis, minio, inbox } }`. 503 only when postgres is down |
| `GET /ai/models` | `{ models: [{ id, provider, model }] }` |
| `POST /ai/chat` | `{ model, messages, system?, maxTokens? }` → `{ text, model, stopReason, usage, costUsd }` |
| `GET /emails?q=&filter=attachments&page=&limit=` | `{ emails: [{ id, from, subject, snippet, attachmentCount }], total, page, limit, counts }` |
| `GET /emails/:id` | `{ email_id, from, subject, body, attachments }` |
| `GET /emails/attachments/:name` | the file |
| `POST /runs` | `{ ratePerSecond?: 0-50, limit?, emailIds? }` → a run summary. `0` is a burst |
| `GET /runs`, `GET /runs/:id` | `{ id, status, ratePerSecond, totalEmails, stageCounts, queues, createdAt, startedAt, finishedAt }` |
| `POST /runs/:id/pause`, `/resume`, `/cancel` | the run summary, or 409 when the status does not allow it |
| `GET /runs/:id/emails?stage=&q=&page=&pageSize=` | `{ emails: [{ emailId, from, subject, stage, attachmentCount, outcome }], total, page, pageSize }` |

```bash
curl -s 127.0.0.1:8091/ai/chat -H "authorization: Bearer $TEAM_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"model":"haiku","messages":[{"role":"user","content":"hello"}]}'
```

## Common tasks

| Task | Where |
| --- | --- |
| Add a model alias | `proxy/proxy.yaml`, restart `./start.sh` |
| Add a table | new file in `backend/db/migrations/`, then `pnpm db:migrate` |
| Add a backend route | a router in `backend/src/routes/`, mounted in `backend/src/app.ts`; its shapes in `backend/src/contracts.ts`; then call it from `frontend/lib/api-client.ts` |
| Add an env var | `backend/src/config.ts` (the only reader) and `backend/.env.example` |
| Run the backend tests | `pnpm test` in `backend/`, with `compose.local.yaml` up. They use the database `retina_test` |
| Add a page | `frontend/app/`. `/` is the inbox, `/mail/[id]` a message, `/chat` the model page, `/runs` the pipeline runs |
| Regenerate the emails | `emails/data_v2/README.md` |
| Check types | `pnpm type-check` in `frontend/` or `backend/`. `pytest` in `proxy/` |
| Debug the proxy | `curl -i 127.0.0.1:4000/v1/messages ...`. Look at the `X-LLM-Proxy-*` headers |

## Deploy

Push to `main`.

- Vercel builds `frontend/`. Set `BACKEND_URL`, `API_SHARED_SECRET` and
  `SITE_PASSWORD` in the Vercel project. The inbox is public. `SITE_PASSWORD`
  is the one shared password for `/chat` and `/runs`; without it those pages are
  public too.
- GitHub Actions type-checks everything and publishes the backend image.
- The Monash server pulls it every 3 minutes, runs the proxy from the same
  checkout and builds the email server from `emails/`. See
  [deploy/README.md](./deploy/README.md).

## Rules

- Never delete, truncate or drop anything in any database without asking.
  Schema changes are new migration files.
- No secrets in git. `.env*` is ignored. `.env.example` has placeholders only.
