# Retina

Three packages in one repo:

```
browser → frontend (Next.js) → backend api (Express + Postgres) → llm-proxy container (Python) → claude -p
                                        ↓ Redis queues          ↘ email server (Python) → emails/data_v2
                               backend worker → MinIO (attachments)
```

| Folder | What it is | Port |
| --- | --- | --- |
| `frontend/` | Next.js app. Calls the backend with a shared secret. | 3000 |
| `backend/` | Express API, plus a worker process that runs the pipeline off Redis queues. | 8091 |
| `proxy/` | Small LLM gateway, run as the `llm-proxy` container of the compose stack. Drives `claude -p` on the Claude subscription. | 4001 on the host (4000 in the container) |
| `emails/` | The inbox: a FastAPI server over the synthetic shipping-documents dataset. The backend reads it. | 8080 |
| `services/doc-extract/` | The parser, run as the `doc-extract` container of the compose stack. Every attachment becomes text (txt, pdf with OCR, docx, xlsx) or is declared unreadable. | 8000 on the host |
| `deploy/` | Scripts and runbook for the Monash server. | — |

Each package has its own deps, `.env` and start command. Always `cd` into a
package first. Nothing runs from the repo root.

## You need

- Node 24 and pnpm 11 (`corepack enable`)
- Docker (for the local Postgres, Redis, MinIO, the email server and the llm-proxy)
- A Claude subscription token for the proxy container: run `claude setup-token` once on a
  machine logged in to the account and keep what it prints. Python is only needed to work
  on `proxy/` itself.

## Run it

Three terminals, in this order. The email server and the llm-proxy need none of their own:
the backend's local compose file runs both.

**1. Backend, with the stack**

```bash
cd backend
cp .env.example .env                            # then set CLAUDE_CODE_OAUTH_TOKEN in it
docker compose -f compose.local.yaml up -d      # Postgres 5433, Redis 6379, MinIO 9000, email server 8080, llm-proxy 4001, doc-extract 8000
pnpm install && pnpm db:migrate && pnpm dev     # the api
```

The llm-proxy is built from `proxy/`. After changing anything there, rebuild it:
`docker compose -f compose.local.yaml up -d --build llm-proxy`. Check it is logged in with
`curl -s 127.0.0.1:4001/v1/messages -H 'content-type: application/json' -d
'{"model":"haiku","max_tokens":20,"messages":[{"role":"user","content":"say ok"}]}'`: a
`provider_not_logged_in` error means the token is missing or expired, and every pipeline call
will fail the same way (fast, not retried).

**2. Worker**, a second terminal in `backend/`. It consumes the queues; without it a
run is created and never moves. It classifies every email with an LLM call through the
proxy, so the llm-proxy container must be up with its token. The proxy serves 2 Claude calls
at a time: set `CLASSIFY_CONCURRENCY=2`, and expect about 40 minutes for the full inbox.
If the proxy goes down mid-run the worker does not fail the emails: it logs `model unavailable,
pausing the classify queue`, stops taking classify jobs for 30 s and puts the job back with its
attempts untouched, so the run carries on once the proxy is back.

```bash
cd backend
pnpm dev:worker
```

`emails/docker-compose.yml` starts the same email server on the same port. Use it
when you want only the inbox; do not run both.

**3. Frontend**

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
only need terminal 3.

## Models

Aliases are model names. They live in `proxy/proxy.yaml`.

| Alias | Runs on | Needs |
| --- | --- | --- |
| `sonnet`, `opus`, `haiku` | Claude Code subscription, from the llm-proxy container | `CLAUDE_CODE_OAUTH_TOKEN` |
| `test` | nothing | nothing |

Every LLM step in the pipeline runs `sonnet`. There are no hand-written classification
rules: the model reads the email, and the eval harness measures it (see `CLAUDE.md`).

`costUsd` on Claude calls is what the API would have charged. Nothing is billed. There are no
local models: Ollama and the Qwen aliases were dropped when the proxy moved into the stack.

## API

All routes except `/health` need `Authorization: Bearer <key>`. The key is
`API_SHARED_SECRET` (frontend) or `TEAM_API_KEY` (you, curl, scripts).

| Route | Body → Result |
| --- | --- |
| `GET /health` | `{ status: "ok" \| "degraded" \| "down", checks, version, queues }`. A check is `{ status, latencyMs }` plus what that dependency says about itself: `inbox` its email count, `docExtract` its tesseract build, `llmProxy` its alias count, `worker` its last heartbeat. 503 only when postgres or redis is down, which is what auto-deploy rolls back on; everything else is `degraded` and still 200 |
| `GET /shipments`, `GET /shipments/:emailId`; `GET /ontology/:kind` for six kinds; `GET /ontology/party/:id/people|ports`, `/ontology/port/:id/parties` | the business pages' readers (phase 13): shipments as the mail states them, a kind's list with attributes, summary and roles, and what sits beside a thing |
| `PATCH /ontology/:kind/:id/attributes`, `POST /ontology/:kind/:id/rename`, `POST /ontology/:kind/:id/merge` | a person correcting a thing from its page, each with `actor` |
| `GET /clients`, `PUT /clients/:domain` | every sender domain seen, with its tier, kind and counts, and `known: false` for one nobody has ranked. The `PUT` takes `{ name?, tier?, kind? }`. A tier orders the queue and decides no category |
| `GET /review`, `GET /review/stats`, `GET /review/:id` | the cases waiting for a person, the queue's own numbers, and one case with its evidence and its history |
| `POST /review/:id/actions`, `POST /review/:id/upload` | what a person does to a case: confirm, correct a field, reclassify, note, retry, reopen, or supply a document. 409 when the case is not in a state where the action means anything |
| `GET /files/*key` | streams one object from MinIO: an attachment, a reviewer's upload, or a rendered page |
| `GET /ai/models` | `{ models: [{ id, provider, model }] }` |
| `POST /ai/chat` | `{ model, messages, system?, maxTokens? }` → `{ text, model, stopReason, usage, costUsd }` |
| `GET /emails?q=&filter=attachments&page=&limit=` | `{ emails: [{ id, from, subject, snippet, attachmentCount }], total, page, limit, counts }` |
| `GET /emails/:id` | `{ email_id, from, subject, body, attachments }` |
| `GET /emails/attachments/:name` | the file |
| `POST /runs` | `{ ratePerSecond?: 0-50, limit?, emailIds?, subset?: "dev" \| "holdout", promptSet?: { classify: "v3" }, models?: { classify: "haiku" } }` → a run summary. `0` is a burst. Repeated `emailIds` are dropped. The prompt version and model of every step are pinned at creation |
| `GET /runs`, `GET /runs/:id` | `{ id, status, ratePerSecond, totalEmails, stageCounts, queues, llm, lastSubmission, createdAt, startedAt, finishedAt }`. `queues` is `null` when Redis cannot be reached; `llm` is the model calls, tokens and cost of the run; `lastSubmission` carries the headline scores |
| `POST /runs/:id/pause`, `/resume`, `/cancel` | the run summary, or 409 when the status does not allow it. A resume that cannot queue its job answers 503 and leaves the run `paused` |
| `POST /runs/:id/submit?force=false` | sends the run to the organisers' scorer → `{ submissionId, finalScore, scoreboard }`. 409 while the run is still ingesting, and 409 `{ incomplete }` while emails are unfinished, both unless forced; 409 while an earlier submission of the same run is still being scored. 502 when the scorer refuses, which leaves an unscored submission row pointing at the stored payload |
| `GET /runs/:id/submission.json` | the payload as it would be sent now: `{ email_id: { category, status, review_reason, has_defect, defect_fields, decided_by } }`, the organisers' enums only |
| `GET /runs/:id/submissions` | `{ submissions: [{ id, finalScore, nEmails, forced, createdAt, scoreboard }] }` |
| `GET /eval/runs/:id` | dev only, 404 unless `EVAL_GROUND_TRUTH_PATH` is set: the run scored locally, `{ full, holdout, run, wrong }` |
| `GET /runs/:id/emails?stage=&category=&decidedBy=&q=&page=&pageSize=` | `{ emails: [{ emailId, from, subject, stage, attachmentCount, outcome, category, decidedBy, confidence, verifierCategory, error }], total, page, pageSize }` |
| `GET /runs/:id/calls?after=` | the run's newest model calls as summaries, for a live feed |
| `GET /runs/:id/live` | the run's model calls running now, each with the answer written so far |
| `GET /runs/:id/emails/:emailId/trace` | one email: stage, the verdict (each reader's answer), the call running now, and every model call with its system prompt, input, answer, final JSON, tokens and cost |
| `GET /prompts` | each prompt step's versions on disk, the active one marked |
| `POST /chat/conversations`, `GET /chat/conversations?runId=` | open a conversation `{ title?, runId?, emailId?, actor }`, or list them. `runId` and `emailId` are its scope: a default the agent may widen, never a filter it cannot see past |
| `POST /chat/:id/messages` | `{ content, actor }` → `{ turn, exhausted }`. One turn is up to eight model calls and can take minutes; there is no streaming. The turn carries the answer, the SQL that produced it, every tool call, and the graph of what it touched |
| `GET /chat/:id`, `DELETE /chat/:id` | the thread with its turns, and delete |
| `GET /ontology/types` | the types the rail offers, with live counts: Emails, Ports, Parties, Carriers, Vessels, Commodities, People and Shipments. Only Shipments is never built, because nothing yet groups one email's shipment rows into a booking across its instruction, its draft and its invoice query |
| `GET /ontology/:type/:id` | one object in the one shape every type shares: stored values each saying who wrote it, and the links out of it |
| `GET /ontology/port/:id/detail` | what is stored, what it is (its profile and attributes, each saying whether it was read in our mail or known already), step out from here, written these ways, and where it appeared |
| `GET /ontology/email/:id/graph?runId=&hops=1\|2` | the email one or two hops out, as nodes and named edges. No coordinates: the layout is the frontend's |
| `GET /database/tables`, `/tables/:schema/:name?limit=&offset=` | every relation of `core` and `analytics` with an exact count, and a page of one with typed columns and the SQL that produced it |
| `GET /database/tables/:schema/:name/rows/:id` | one row as fields, then what points at it by foreign key |

```bash
curl -s 127.0.0.1:8091/ai/chat -H "authorization: Bearer $TEAM_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"model":"haiku","messages":[{"role":"user","content":"hello"}]}'
```

## Common tasks

| Task | Where |
| --- | --- |
| Add a model alias | `proxy/proxy.yaml`, then rebuild the llm-proxy container |
| Add a table | new file in `backend/db/migrations/`, then `pnpm db:migrate` |
| Add a backend route | a router in `backend/src/routes/`, mounted in `backend/src/app.ts`; its shapes in `backend/src/contracts.ts`; then call it from `frontend/lib/api-client.ts` |
| Add an env var | `backend/src/config.ts` (the only reader) and `backend/.env.example` |
| Score a run locally | `pnpm eval:score --run <id> [--holdout]` in `backend/`. Needs `EVAL_GROUND_TRUTH_PATH` |
| Prove the scorer port | `pnpm eval:parity` in `backend/`: `src/eval/score.ts` against the organisers' `score_cli.py` |
| Change how emails are classified | a new version file in `backend/src/agents/prompts/classify/`. Never a rule in code. Check it on train ids, read the holdout last |
| Run the backend tests | `pnpm test` in `backend/`, with `compose.local.yaml` up. They use the database `retina_test` |
| Measure a burst | `pnpm load-test [--limit N]` in `backend/`: starts a run at rate 0, then prints its elapsed time, peak queue depth, the peak model calls in flight and any 429s. Needs one worker running, and only one |
| Change who is served first | `/clients` in the app, or `PUT /clients/:domain`. A tier orders the queue; it never decides a category |
| Add a page | `frontend/app/(app)/`, under the layout that mounts the rail and the chat dock once. Everything run-scoped lives under `runs/[id]/`: the overview, `inbox`, `review`, `database`, `ontology` and `chat`. The Business data cluster is global: `company`, `port`, `shipment` and `clients` (drawn as Senders). A page announces what it is about to the dock with `<PageContext>` and its rail counts with `<NavCounts>` |
| Regenerate the emails | `emails/data_v2/README.md` |
| Check types | `pnpm type-check` in `frontend/` or `backend/`. `pytest` in `proxy/`; `uv run pytest && uv run ruff check .` in `services/doc-extract/` |
| Change how a document is parsed | an extractor in `services/doc-extract/extractors/`, then `docker compose -f compose.local.yaml up -d --build doc-extract` in `backend/` |
| Debug the proxy | `curl -i 127.0.0.1:4000/v1/messages ...`. Look at the `X-LLM-Proxy-*` headers |
| Rebuild the analytics views and the ontology | `pnpm derive` in `backend/`. The worker does it every five minutes when `core` has moved; this is for straight after a deploy and before a demo |
| Place every port and code every company from the reference lists | `pnpm ontology:locate` in `backend/`. Free and idempotent; the resolver does the same for each new port as it creates it |
| Read the mail's shipments into the ontology | `pnpm ontology:backfill [--limit N]` in `backend/`, with a worker running. It spends tokens: development runs stay at 20 to 30 and the full backfill is the user's to start |
| Check the semantic layer at scale | `pnpm ontology:bench` in `backend/`: 200,000 things and 2,000,000 sightings inside a transaction that is rolled back, then `explain analyze` on the four lookups a question makes. No model is called and it is not part of `pnpm test` |
| Read the profiles as files | `pnpm ontology:export` in `backend/`. One folder per kind; nothing reads it back, because the rows are the source of truth |
| Measure the chat | `pnpm eval:chat [--set ontology] [--limit N]` in `backend/`. The `chat` set asks about the work, the `ontology` set about the things. Both spend tokens |
| Ask a question whose words are in no column | `find_entities` does it: it defines the term, judges the things against the definition, keeps every verdict and hands back a subquery to join on. `ONTOLOGY_KNOWLEDGE=mail` turns off the half of a profile that comes from the model's own knowledge |
| Change what the chat can read | `backend/src/agents/chat/schema-docs.md` for what it is told, and a `grant` migration for what it may actually read. A grant in an earlier migration does not reach a table a later one adds |
| Add a chat tool | a file in `backend/src/agents/chat/tools/`, added to the registry in its `index.ts`. `src/mcp.ts` serves the same registry, so it appears over MCP with no second definition |
| Use the tools from Claude Code | `.mcp.json` at the repo root already configures them. `pnpm mcp` in `backend/` runs the server by hand |
| Give a model a structured answer with two shapes | one flat object with the discriminant as a field, narrowed after it parses. The provider refuses a union at the top level of a tool schema, and `toOutputSchema` refuses one before it gets there |

## Deploy

Push to `main`.

- Vercel builds `frontend/`. Set `BACKEND_URL`, `API_SHARED_SECRET` and
  `SITE_PASSWORD` in the Vercel project. The inbox is public. `SITE_PASSWORD`
  is the one shared password for `/chat` and `/runs`; without it those pages are
  public too.
- GitHub Actions type-checks both packages, runs the backend suite against a
  Postgres service container, builds the frontend, runs the proxy's tests and
  publishes the backend image. The same gates run on a pull request.
- The Monash server pulls every 3 minutes, builds the api image from the same
  checkout, runs `api` and `worker` beside postgres, redis, minio and the email
  server, and rolls back if `/health` does not come up. See
  [deploy/README.md](./deploy/README.md).
- Changing a deploy script? Run it first: `cd deploy/sim && ./sim.sh up && ./sim.sh test`
  puts `auto-deploy.sh` and `bootstrap-wizard.sh` through a replica of the box,
  rollback included.

## Rules

- Never delete, truncate or drop anything in any database without asking.
  Schema changes are new migration files.
- No secrets in git. `.env*` is ignored. `.env.example` has placeholders only.
