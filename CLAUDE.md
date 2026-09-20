# Retina

Retina SDOC: shipping document verification for the Averis x Monash hackathon, built on the
Retina monorepo. Read this file fully before touching code.

Four independent packages. Run commands inside a package, never at the root.

- `frontend/` Next.js 16, on Vercel. Read `frontend/AGENTS.md` before writing Next code.
- `backend/` Express + Postgres, on the Monash server behind ngrok.
- `proxy/` Python. Anthropic-wire gateway to `claude -p`, run as the `llm-proxy` container of
  the compose stack (local and box), logged in by `CLAUDE_CODE_OAUTH_TOKEN`.
- `emails/` The Averis kit: a FastAPI server in `emails/server` that serves the synthetic
  inbox in `emails/data_v2` and scores submissions at `POST /submit`. The backend reads it
  over HTTP. Do not edit the dataset by hand; `data_v2/generate.py` makes it.
- `deploy/` Scripts and runbook for the Monash server.

Setup, ports, aliases and the current API are in `README.md`. The server is in
`deploy/README.md`.

Design docs: `docs/SDOC_BRIEF.md` (the problem and the data, every number verified),
`docs/01-product.md` (what), `docs/02-infra-overview.md` (how, high level),
`docs/03-infra-deep.md` (contracts, schema, routes), `docs/04-phases.md` (what to build now),
`docs/phases/phase-NN-*.md` (the authoritative work list per phase, plus a `-handover.md` where
one phase left the next something to know). `docs/PROGRESS.md` says which phase is current and
what is left in it.

## Session protocol

1. Read `docs/PROGRESS.md`, then the current phase section in `docs/04-phases.md`, then the
   phase spec in `docs/phases/`. Where a `phase-NN-handover.md` exists, read it before the spec:
   it says what a previous phase or review changed under this one, and the spec may still be
   catching up.
2. Work only inside that phase's scope. If something outside it blocks you, write it under
   "Deferred" in `PROGRESS.md` and stub it, do not build it.
3. Every phase ends with its exit checklist green, `PROGRESS.md` updated, and a commit on `main`.
4. If a contract in `03-infra-deep.md` must change, change the doc in the same commit.
5. Where a design doc and the repo disagree, the repo wins for anything already built and the
   doc is corrected in the same commit. The doc wins for anything not built yet.

## Commands

```bash
# proxy: a container of the backend compose stack (host :4001), built from proxy/
docker compose -f compose.local.yaml up -d --build llm-proxy   # inside backend/
pytest                              # inside proxy/

# backend, inside backend/
pnpm install && pnpm db:migrate
pnpm dev                            # api on :8091
pnpm dev:worker                     # queue consumers + schedulers
pnpm test                           # vitest; needs compose.local.yaml up (uses database retina_test)
pnpm type-check
pnpm eval:score --run <id> [--holdout]   # (phase 2)

# frontend, inside frontend/
pnpm dev                            # :3000
pnpm type-check

# python doc-extract, inside services/doc-extract/ (phase 5)
uv run uvicorn app:app --port 8000
uv run pytest && uv run ruff check .

# local infra, from backend/ (postgres :5433, redis :6379, minio :9000, the inbox :8080).
# This also starts the Averis inbox and scorer. Start it here and not from
# emails/: both define the same service on 8080, and only this one binds it to
# loopback.
docker compose -f compose.local.yaml up -d
```

## Architecture in ten lines

- `api` receives HTTP, validates, writes to Postgres, enqueues, reads back. No pipeline logic.
- `worker` consumes `classify` and `compare` queues and runs pipeline stages in order.
- `pipeline/` is pure: functions from plain inputs to plain outputs. No database, no queue, no
  HTTP inside. Workers load inputs through repositories, call pipeline functions, persist results.
- `ontology/repositories/` owns all SQL. Nothing else writes SQL except the chat, read-only and on
  `roPool`: `agents/chat/tools/run_sql` (model-written) and the recipe files under `agents/chat/skills/`.
- `agents/` owns every LLM call: prompt files, structured output, the chat tool loop.
- `ingest/` turns an external inbox into rows and jobs behind the `Source` interface. The first
  source is the Averis server in `emails/`, reached at `EMAIL_SERVER_URL`.
- `storage/` wraps MinIO. `queues/` wraps BullMQ. `llm.ts` wraps the proxy.
- `services/doc-extract` is a separate Python service. The worker talks to it over HTTP only.
- `frontend/lib/api-client.ts` is the only door from the frontend to the backend: a barrel over
  `frontend/lib/api/`, one file per resource plus `transport.ts`.
- Contracts (request and response types) live in `backend/src/contracts.ts` and are mirrored
  by hand as zod schemas in `frontend/lib/api/`. Every response is parsed, so a drift fails at
  the boundary naming the field instead of reaching a component as undefined.

## Module rules

**Deep modules.** A module exposes a small interface and hides a lot. `structured.ts` exports
one function and nothing about JSON extraction or retries leaks out. If a caller needs to know how a module works
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
  from the type (a `TerminalError` becomes BullMQ's `UnrecoverableError`). A dependency that
  answered with a failure is one `UpstreamError` carrying its status and, where it states one,
  its own `retryable` verdict. Never swallow an error; never `catch {}`.
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
- Migrations are expand/contract. A rollback restores the previous image and leaves the schema
  where the failed deploy put it, so every migration must still be readable by the code it rolls
  back to: add, do not rename or drop, and no `NOT NULL` without a default. Contract in a later
  commit. See `deploy/README.md`.
- Hand-written SQL with `pg`, parameterised. No ORM. One repository module per aggregate.
- Write to Postgres before enqueueing. Job payloads carry ids only.
- Job id is `${runId}__${emailId}` (BullMQ rejects a custom id containing `:`). Re-running a
  stage replaces that stage's rows for that run.
- `ground_truth.json` lives in `emails/data_v2/` as part of the organiser kit and is mounted
  only into the Averis container. `eval/` is the only code that may read it. Any other import
  fails review. Never copy it anywhere else.

## Proxy rules

- The proxy's HTTP contract is fixed: `POST /v1/messages` (Anthropic wire), `GET /v1/models`,
  `GET /healthz`, `X-LLM-Proxy-*` headers, and an error envelope carrying `code` and
  `retryable`. The backend depends on it. Change both sides or neither.
- Retryability is the proxy's to state, never the caller's to guess from a status. An unknown
  provider and a dead upstream are both 500; only one is worth another attempt.
- Aliases in `proxy/proxy.yaml` are model names (`sonnet`, `haiku`). Do not invent names.
- The proxy is part of the stack. There is no remote gateway: `LLM_PROXY_URL` names the
  `llm-proxy` service, and a missing Claude login is a permanent error, never an outage.

## Classification and enums

- The LLM classifies. No hand-written rule decides a category: no sender or domain lists, no
  subject or body keyword tables, no regexes over email content, no pattern-based stripping of
  signatures or threads. The inbox is one small seeded sample and the judges may score another.
- Prompts describe the task, not the dataset. Every statement in a prompt traces to the
  organisers' written definitions (the brief, `emails/data_v2/README.md`), never to a frequency
  seen in the inbox.
- `category`, `status`, `review_reason` and the seven field names are the organisers' enums, value
  for value. One zod definition each in `contracts.ts`, repeated as database check constraints,
  mirrored in `api-client.ts`. Never add a value. A job that fails is a failure, not a
  `review_reason`.
- The eval harness, not intuition, says whether a change helped. Develop on the train split,
  read the holdout last.

## LLM rules

- Prompts are files under `agents/prompts/<step>/<version>.md`. Code never contains prompt text.
- Every call goes through `agents/structured.ts` with a zod schema. Free-text parsing is banned.
- The model reads and the model judges. Document type, field extraction, and whether two field
  values mean the same thing are LLM calls. Code assembles the answer (the set of fields the
  model judged different) and validates it against the enums. No hand-written normalisers,
  label tables or title matching: those are rules fitted to one sample, like the email ones.
- Every LLM step runs `sonnet`. `LLM_MODEL_<STEP>` exists for experiments, not as a default. A
  wrong alias must fail fast: the proxy answers 500 with `retryable: false`, and anything that
  decides retry from the status instead requeues it forever without spending an attempt.
- Retry is the dependency's call, not the caller's guess. Branch on `isTransient(error)` from
  `lib/errors.ts`, never on a list of status codes.
- Extracted values carry `source_quote`; the evidence check runs before any verifier.
- Store every call in `llm_calls` with `prompt_version`, tokens, cost, latency.
- Few-shot examples come from `eval/split.json` train ids only, and ship only when a holdout
  run shows they help.

## Testing

- vitest in `backend/`, pytest in `services/doc-extract/` and `proxy/`.
- Unit tests are mandatory for pure modules: `classify/input`, `compare/assemble`, `decide`,
  `triage`, `evidence`, `eval/score`, `eval/split`. Table-driven, fixtures from real dataset lines
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
- Every backend response is parsed with zod in `lib/api/`. No `as` on a fetch result.
- `eslint` enforces the 200-line rule for the frontend. Split rather than raise it.

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
- Do not classify with hand-written rules, and do not key anything on specific `email_id`s.
  Judges may use a fresh dataset seed.
- Do not store or submit an enum value the organisers did not define.
- Do not bind Redis, MinIO, Postgres, doc-extract, or the Averis server to a public interface.
- Do not mount the answer key into `api` or `worker`.
- Do not skip the evidence check to save an LLM call.
- Do not use em dashes in docs or UI copy.
