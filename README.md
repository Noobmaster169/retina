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

On Windows (Git Bash) the interpreter is elsewhere, and if another project already holds port
4000, take 4001 and point `LLM_PROXY_URL` in `backend/.env` at it:

```bash
python -m venv .venv && .venv/Scripts/python.exe -m pip install -e ".[dev]"
PYTHON=.venv/Scripts/python.exe LLM_PROXY_PORT=4001 ./start.sh
```

**Or use a proxy someone else is already running.** Where the proxy itself is not reachable (the
Monash box keeps it on its Docker bridge, never public), point `LLM_PROXY_URL` at another Retina
API's `/ai/chat`, which fronts one:

```
LLM_PROXY_URL=https://<host>/ai/chat
TEAM_API_KEY=<that API's key>
```

A URL ending in `/ai/chat` selects that transport; anything else is a proxy and gets the Anthropic
wire. The bearer sent is `TEAM_API_KEY`. The cost: `/ai/chat` has no structured output, so the
answer schema reaches the model through the prompt only and the zod parse in `agents/structured.ts`
is the whole guarantee. Every call then spends that host's Claude login, not yours.

**2. Backend**

```bash
cd backend
cp .env.example .env
docker compose -f compose.local.yaml up -d      # Postgres 5433, Redis 6379, MinIO 9000, email server 8080
pnpm install && pnpm db:migrate && pnpm dev     # the api
```

**3. Worker**, a second terminal in `backend/`. It consumes the queues; without it a
run is created and never moves. It classifies every email with an LLM call through the
proxy, so the proxy must be up and `claude` logged in. The proxy serves 2 Claude calls at
a time: set `CLASSIFY_CONCURRENCY=2`, and expect about 25 minutes for the full inbox.
If the proxy goes down mid-run the worker does not fail the emails: it logs `model unavailable,
pausing the classify queue`, stops taking classify jobs for 30 s and puts the job back with its
attempts untouched, so the run carries on once the proxy is back.

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

Every LLM step in the pipeline runs `sonnet`. There are no hand-written classification
rules: the model reads the email, and the eval harness measures it (see `CLAUDE.md`).

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
| `POST /runs` | `{ ratePerSecond?: 0-50, limit?, emailIds? }` → a run summary. `0` is a burst. Repeated `emailIds` are dropped |
| `GET /runs`, `GET /runs/:id` | `{ id, status, ratePerSecond, totalEmails, stageCounts, queues, llm, lastSubmission, createdAt, startedAt, finishedAt }`. `queues` is `null` when Redis cannot be reached; `llm` is the model calls, tokens and cost of the run; `lastSubmission` carries the headline scores |
| `POST /runs/:id/pause`, `/resume`, `/cancel` | the run summary, or 409 when the status does not allow it. A resume that cannot queue its job answers 503 and leaves the run `paused` |
| `POST /runs/:id/submit?force=false` | sends the run to the organisers' scorer → `{ submissionId, finalScore, scoreboard }`. 409 while the run is still ingesting, and 409 `{ incomplete }` while emails are unfinished, both unless forced; 409 while an earlier submission of the same run is still being scored. 502 when the scorer refuses, which leaves an unscored submission row pointing at the stored payload |
| `GET /runs/:id/submission.json` | the payload as it would be sent now: `{ email_id: { category, status, review_reason, has_defect, defect_fields, decided_by } }`, the organisers' enums only |
| `GET /runs/:id/submissions` | `{ submissions: [{ id, finalScore, nEmails, forced, createdAt, scoreboard }] }` |
| `GET /eval/runs/:id` | dev only, 404 unless `EVAL_GROUND_TRUTH_PATH` is set: the run scored locally, `{ full, holdout, run, wrong }` |
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
| Score a run locally | `pnpm eval:score --run <id> [--holdout]` in `backend/`. Needs `EVAL_GROUND_TRUTH_PATH` |
| Prove the scorer port | `pnpm eval:parity` in `backend/`: `src/eval/score.ts` against the organisers' `score_cli.py` |
| Change how emails are classified | a new version file in `backend/src/agents/prompts/classify/`. Never a rule in code. Check it on train ids, read the holdout last |
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
