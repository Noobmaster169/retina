# Retina

Retina SDOC: shipping document verification for the Averis x Monash hackathon, built on the
Retina monorepo. Read this file fully before touching code.

Four independent packages. Run commands inside a package, never at the root.

- `frontend/` Next.js 16, on Vercel. Read `frontend/AGENTS.md` before writing Next code.
- `backend/` Express + Postgres, on the Monash server behind ngrok.
- `proxy/` Python. Anthropic-wire gateway to `claude -p` and Ollama.
- `emails/` The Averis kit: a FastAPI server in `emails/server` that serves the synthetic
  inbox in `emails/data_v2` and scores submissions at `POST /submit`. The backend reads it
  over HTTP. Do not edit the dataset by hand; `data_v2/generate.py` makes it.
- `deploy/` Scripts and runbook for the Monash server.

Setup, ports, aliases and the current API are in `README.md`. The server is in
`deploy/README.md`.

Design docs: `docs/SDOC_BRIEF.md` (the problem and the data, every number verified),
`docs/01-product.md` (what), `docs/02-infra-overview.md` (how, high level),
`docs/03-infra-deep.md` (contracts, schema, routes), `docs/04-phases.md` (what to build now),
`docs/phases/phase-NN-*.md` (the authoritative work list per phase). `docs/PROGRESS.md` says
which phase is current and what is left in it.

## Session protocol

1. Read `docs/PROGRESS.md`, then the current phase section in `docs/04-phases.md`, then the
   phase spec in `docs/phases/`.
2. Work only inside that phase's scope. If something outside it blocks you, write it under
   "Deferred" in `PROGRESS.md` and stub it, do not build it.
3. Every phase ends with its exit checklist green, `PROGRESS.md` updated, and a commit on `main`.
4. If a contract in `03-infra-deep.md` must change, change the doc in the same commit.
5. Where a design doc and the repo disagree, the repo wins for anything already built and the
   doc is corrected in the same commit. The doc wins for anything not built yet.

## Commands

```bash
# email server + scorer, inside emails/
docker compose up --build -d        # :8080, GET /emails, POST /submit

# proxy, inside proxy/
./start.sh                          # :4000
pytest

# backend, inside backend/
pnpm install && pnpm db:migrate
pnpm dev                            # api on :8091
pnpm dev:worker                     # queue consumers + schedulers (phase 1)
pnpm test                           # vitest, unit + integration (phase 1)
pnpm type-check
pnpm eval:score --run <id> [--holdout]   # (phase 2)

# frontend, inside frontend/
pnpm dev                            # :3000
pnpm type-check

# python doc-extract, inside services/doc-extract/ (phase 5)
uv run uvicorn app:app --port 8000
uv run pytest && uv run ruff check .

# local infra, from backend/ (postgres :5433; redis and minio from phase 1)
docker compose -f compose.local.yaml up -d
```

## Architecture in ten lines

- `api` receives HTTP, validates, writes to Postgres, enqueues, reads back. No pipeline logic.
- `worker` consumes `classify` and `compare` queues and runs pipeline stages in order.
- `pipeline/` is pure: functions from plain inputs to plain outputs. No database, no queue, no
  HTTP inside. Workers load inputs through repositories, call pipeline functions, persist results.
- `ontology/repositories/` owns all SQL. Nothing else writes SQL except `agents/chat/tools/run_sql`.
- `agents/` owns every LLM call: prompt files, structured output, the chat tool loop.
- `ingest/` turns an external inbox into rows and jobs behind the `Source` interface. The first
  source is the Averis server in `emails/`, reached at `EMAIL_SERVER_URL`.
- `storage/` wraps MinIO. `queues/` wraps BullMQ. `llm.ts` wraps the proxy.
- `services/doc-extract` is a separate Python service. The worker talks to it over HTTP only.
- `frontend/lib/api-client.ts` is the only door from the frontend to the backend.
- Contracts (request and response types) live in `backend/src/contracts.ts` and are mirrored
  by hand into `frontend/lib/api-client.ts`.

## Module rules

**Deep modules.** A module exposes a small interface and hides a lot. `normalise.ts` exports
seven functions and nothing about regexes leaks out. If a caller needs to know how a module works
to use it, the interface is wrong.

**One responsibility per file.** File name states it: `fingerprint.ts` fingerprints documents.
If a file needs "and" in its description, split it.

**Dependencies point inward.**

```
routes, workers, schedulers        (orchestration, allowed to import everything below)
  -> repositories, storage, queues, llm, doc-extract client   (adapters)
  -> pipeline, contracts, domain types                         (pure core, imports nothing above)
```

Pure core never imports an adapter. Adapters never import each other. Orchestration is thin:
load, call, save, enqueue.

**Explicit seams.** Every external system sits behind one interface with one real
implementation and one fake for tests: `Source`, `LlmClient`, `DocExtractClient`,
`ObjectStore`. Fakes live next to the interface in `__fakes__/`.

**Public surface through `index.ts`.** Each folder under `pipeline/`, `agents/`, `ingest/`
exports what others may use. Importing a sibling's internal file is a bug.

**No premature abstraction.** Two similar lines are fine. Three similar blocks earn a function.
A base class needs a third concrete subclass to exist. Keep it simple; do not add what is not
needed.

## Code style

- TypeScript strict. No `any`. `unknown` at boundaries, narrowed with zod.
- Functions over classes. Classes only for stateful clients (pool, queue, MinIO).
- Named exports. No default exports except Next.js pages.
- Files kebab-case. Types and schemas PascalCase. Database columns snake_case; repositories map
  to camelCase at the boundary and nowhere else.
- Zod schema at every boundary: HTTP bodies, job payloads, LLM outputs, env, doc-extract
  responses. Derive TS types from schemas, never the other way around.
- Errors: throw `RetryableError` or `TerminalError` from `lib/errors.ts`. Workers decide retry
  from the type. Never swallow an error; never `catch {}`.
- Comments say why, never what. No banner comments, no commented-out code, no TODO without a
  `PROGRESS.md` entry.
- No emoji in code, logs, or docs.
- Logging: pino, one logger per module, always include `runId`, `emailId`, `stage` when known.
- Config only from `config.ts`. No `process.env` anywhere else.
- Async everywhere; no `.then` chains; no fire-and-forget promises.
- Prefer early return over nested `if`.
- Keep files under 200 lines. A longer file is usually two modules.

## Data rules

- Never delete, truncate, drop or overwrite anything in any database, local or production,
  unless the user asked or approved first.
- Migrations are forward-only SQL in `backend/db/migrations/NNN_name.sql`, applied by the
  existing `db/migrate.mjs`. Never edit an applied one.
- Hand-written SQL with `pg`, parameterised. No ORM. One repository module per aggregate.
- Write to Postgres before enqueueing. Job payloads carry ids only.
- Job id is `${runId}:${emailId}`. Re-running a stage replaces that stage's rows for that run.
- `ground_truth.json` lives in `emails/data_v2/` as part of the organiser kit and is mounted
  only into the Averis container. `eval/` is the only code that may read it. Any other import
  fails review. Never copy it anywhere else.

## Proxy rules

- The proxy's HTTP contract is fixed: `POST /v1/messages` (Anthropic wire), `GET /v1/models`,
  `GET /healthz`, `X-LLM-Proxy-*` headers. The backend depends on it. Change both sides or
  neither.
- Aliases in `proxy/proxy.yaml` are model names (`haiku`, `qwen3:14b`). Do not invent names.

## LLM rules

- Prompts are files under `agents/prompts/<step>/<version>.md`. Code never contains prompt text.
- Every call goes through `agents/structured.ts` with a zod schema. Free-text parsing is banned.
- Models extract, code compares. The model never emits the final `defect_fields`.
- Extracted values carry `source_quote`; the evidence check runs before any verifier.
- Store every call in `llm_calls` with `prompt_version`, tokens, cost, latency.
- Few-shot examples come from `eval/split.json` train ids only.

## Testing

- vitest in `backend/`, pytest in `services/doc-extract/` and `proxy/`.
- Unit tests are mandatory for pure modules: `rules`, `fingerprint`, `normalise`, `compare`,
  `decide`, `triage`, `evidence`, `eval/score`. Table-driven, fixtures from real dataset lines
  copied into `test/fixtures/`.
- Repository tests run against the local Postgres in a transaction rolled back per test.
- Workers are tested with fakes for `LlmClient`, `DocExtractClient`, `ObjectStore`.
- No test hits the real proxy. A `RecordingLlmClient` can replay saved responses from
  `test/fixtures/llm/`.
- A pipeline change is not done until `pnpm eval:score --holdout` runs and the number is in
  the commit message.

## Frontend rules

- Server components fetch through `api-client.ts`. Client components poll with SWR and never
  hold secrets.
- No business logic in the frontend. If a page computes a status, the API should return it.
- One component per file, colocated under its route. Shared UI in `components/`.
- Tailwind; no CSS beyond `globals.css`. No component library beyond what the template ships.
- The password gate is `lib/site-gate.ts` plus `proxy.ts`, keyed by `SITE_PASSWORD`. Extend its
  matcher; do not add a second gate.

## Python service rules

- FastAPI, pydantic models for every request and response, one extractor module per format in
  `extractors/`, a `registry.py` that picks by content type.
- `ruff` clean, `pytest` with sample files under `tests/fixtures/`.
- Never raise on a bad file. Return `unreadable: true` with a warning.

## Git

- Branch per phase: `phase-03-vps-deploy`. Merge to `main` when the exit checklist passes.
  `main` auto-deploys to the VPS every 3 minutes.
- Conventional commit prefixes: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`.
- Small commits, each one builds and passes tests.
- No secrets in git. Never commit `.env`, or anything under `eval/reports/`.

## Definition of done for any change

1. Type-check and tests pass.
2. New boundary has a zod schema and a fake.
3. New pure module has a table-driven test.
4. Contract change is mirrored in `api-client.ts` and `03-infra-deep.md`.
5. `PROGRESS.md` updated if the phase checklist moved.

## Do not

- Do not add a queue, service, table, or abstraction the current phase does not need.
- Do not put SQL, HTTP, or queue calls inside `pipeline/`.
- Do not let an LLM output reach the database without passing a zod schema.
- Do not write rules keyed on specific `email_id`s. Judges may use a fresh dataset seed.
- Do not bind Redis, MinIO, Postgres, doc-extract, or the Averis server to a public interface.
- Do not mount the answer key into `api` or `worker`.
- Do not skip the evidence check to save an LLM call.
- Do not use em dashes in docs or UI copy.
