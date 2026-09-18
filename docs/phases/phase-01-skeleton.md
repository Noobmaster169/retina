# Phase 1: Skeleton

## As built

Phase 1 is done. Where the work items below disagree with this list, this list is what the code
does, and `CLAUDE.md` and `03-infra-deep.md` have been corrected to match.

- **No build step.** The image runs TypeScript through tsx, so the scripts are
  `node --import tsx src/worker.ts` and there is no `dist/`. `pnpm type-check`, not `typecheck`.
- **Job ids are `${runId}__${emailId}`.** BullMQ 6 rejects a custom id containing `:`.
  The resume job is `${runId}__resume__${timestamp}`.
- **`job.discard()` is gone in BullMQ 6.** A `TerminalError` is rethrown as `UnrecoverableError`.
- **Config keeps the discrete `PG_*` variables** the repo and `deploy/compose.yaml` already use, and
  `EMAIL_SERVER_URL`. Redis and MinIO have defaults and optional credentials, so the api still boots
  on the VPS, where they do not exist until phase 3, and reports them `down` in `/health`.
- **Local Postgres is unchanged** (`postgres` / `localdev`, database `postgres`, port 5433), so
  nobody's existing volume is orphaned. Tests use `retina_test` in the same instance.
- **MinIO comes from `quay.io/minio/minio`.** `minio/minio` no longer exists on Docker Hub.
- **The Averis server is the compose service `inbox`**, built from `../emails/server`. It is the same
  service `emails/docker-compose.yml` starts, so run one or the other.
- **`/health` is 503 only when postgres is down**, as before; degraded is 200. The check is called
  `inbox`, not `averis`.
- **The frontend gate is the existing one.** `proxy.ts` gained `/runs` and `/api/runs` in its matcher;
  there is no `middleware.ts`, `FRONTEND_PASSWORD` or `SESSION_SECRET`. The inbox stays public and the
  chat page stays in the navigation.
- **Run status moves are conditional updates** (`runs.markStarted`, `runs.setStatus(id, to, from)`)
  instead of a free `update(id, patch)`: a run paused before its controller starts stays paused.
- **The replay controller re-enqueues rows left at `ingested`**, which covers a crash between the
  commit and the enqueue. The ingest queue uses a 30 s lock so a dead worker's run is reclaimed in
  under a minute; on SIGTERM the ingest job moves itself to `delayed` instead of spending an attempt.
- **Queue counts add `prioritized` and `delayed` into `waiting`.** A job with a priority never sits
  in BullMQ's `waiting` list, and every email job has one.

## Goal

An email travels Averis → Postgres → MinIO → `classify` queue → `compare` queue → stage `done`
with no intelligence in between. This phase creates every shape later phases fill in: config,
errors, logging, migrations, repositories, the `Source` interface, object storage, both queues,
the worker process, the run controller, the first routes, and the gated frontend.

## Prerequisites

- Retina repo as described in its README (Express `app.ts`, `auth.ts`, `db.ts`, `llm.ts`,
  `db/migrate.mjs`, Next.js frontend with `lib/api-client.ts`).
- Docker Desktop locally. Node 20+, pnpm 9+.
- Organiser kit already in `emails/` (server + data_v2, committed). The answer key is mounted only into the averis container.

## Scope

In: everything listed under work items. Out: any classification logic, any LLM call, any
parsing, any UI beyond the runs list and a password gate.

## Work items

### 1. Dependencies

```bash
cd backend
pnpm add bullmq ioredis zod pino minio
pnpm add -D vitest @types/node tsx pino-pretty
```

`package.json` scripts (add to existing):

```json
{
  "dev": "tsx watch src/index.ts",
  "dev:worker": "tsx watch src/worker.ts",
  "build": "tsc -p tsconfig.json",
  "start": "node dist/index.js",
  "start:worker": "node dist/worker.js",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
}
```

`src/index.ts` is the API entry (existing behaviour: run migrations, then listen). If the
template starts the server inside `app.ts`, split it: `app.ts` exports `createApp(deps)`,
`index.ts` wires deps and listens. Tests need `createApp` without a listening socket.

### 2. Local infrastructure: `backend/compose.local.yaml`

```yaml
services:
  postgres:
    image: postgres:17
    environment: { POSTGRES_USER: retina, POSTGRES_PASSWORD: retina, POSTGRES_DB: retina_dev }
    ports: ["5433:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U retina"], interval: 5s, retries: 10 }

  redis:
    image: redis:7
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction", "--maxmemory", "512mb"]
    ports: ["6379:6379"]
    volumes: [redisdata:/data]

  minio:
    image: minio/minio
    command: ["server", "/data", "--console-address", ":9001"]
    environment: { MINIO_ROOT_USER: retina, MINIO_ROOT_PASSWORD: retinaretina }
    ports: ["9000:9000", "9001:9001"]
    volumes: [miniodata:/data]
    healthcheck: { test: ["CMD", "mc", "ready", "local"], interval: 5s, retries: 10 }

  minio-init:
    image: minio/mc
    depends_on: { minio: { condition: service_healthy } }
    entrypoint: >
      /bin/sh -c "mc alias set local http://minio:9000 retina retinaretina &&
                  mc mb --ignore-existing local/retina && exit 0"

  averis:
    build: ../emails/server
    ports: ["127.0.0.1:8080:8000"]
    volumes:
      - ../emails/data_v2:/data:ro
      - ../emails/data_v2/ground_truth.json:/secrets/ground_truth.json:ro
    environment: { DATA_DIR: /data, GROUND_TRUTH: /secrets/ground_truth.json }

volumes: { pgdata: {}, redisdata: {}, miniodata: {} }
```

`emails/` layout: `server/` (their `app.py`, `scoring.py`, `score_cli.py`, `Dockerfile`,
`requirements.txt`), `data_v2/` (their `inbox/`, `attachments/`, `sample_submission.json`;
the generator `.py` files stay for the fresh-seed test in phase 12).
The kit is already committed under `emails/`; nothing to copy and nothing to gitignore. `emails/docker-compose.yml` is the organiser file and stays as is.

### 3. Config: `src/config.ts`

One zod schema, parsed once, exported as `config`. Fail fast on boot with the list of missing
variables.

```ts
const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8091),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  MINIO_ENDPOINT: z.string(),          // host:port
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET: z.string().default("retina"),
  MINIO_USE_SSL: z.coerce.boolean().default(false),
  EMAIL_SERVER_URL: z.string().url(),
  API_SHARED_SECRET: z.string().min(16),
  TEAM_API_KEY: z.string().min(16),
  LLM_PROXY_URL: z.string().url(),
  CLASSIFY_CONCURRENCY: z.coerce.number().default(4),
  COMPARE_CONCURRENCY: z.coerce.number().default(4),
  LOG_LEVEL: z.string().default("info"),
});
```

`.env.example` updated with every key and local defaults
(`DATABASE_URL=postgres://retina:retina@localhost:5433/retina_dev`,
`REDIS_URL=redis://localhost:6379`, `MINIO_ENDPOINT=localhost:9000`,
`EMAIL_SERVER_URL=http://localhost:8080`).

### 4. Cross-cutting: `src/lib/`

- `errors.ts`: `class RetryableError extends Error { constructor(message, cause?) }`,
  `class TerminalError extends Error`, helper `isRetryable(err)`.
- `logger.ts`: pino root logger; `childLogger(bindings)`; pretty transport in development.
- `time.ts`: `sleep(ms)`, `nowIso()`.
- `ids.ts`: `jobId(runId, emailId)` → `${runId}:${emailId}`; `newRunId()` → uuid v4.

### 5. Migration `db/migrations/001_runs_emails.sql`

```sql
create schema if not exists core;

create table core.runs (
  id               uuid primary key,
  source           text not null,
  rate_per_second  numeric not null default 0,
  email_limit      int,
  email_ids        text[],
  status           text not null check (status in ('created','running','paused','completed','cancelled','failed')),
  total_emails     int,
  prompt_set       jsonb not null default '{}'::jsonb,
  created_by       text,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz
);

create table core.clients (
  domain      text primary key,
  name        text,
  tier        smallint not null default 3 check (tier between 1 and 5),
  kind        text not null default 'customer' check (kind in ('customer','internal','forwarder','spam')),
  updated_at  timestamptz not null default now()
);

create table core.emails (
  email_id       text primary key,
  from_addr      text not null,
  sender_domain  text not null,
  subject        text not null,
  body           text not null,
  attachment_paths text[] not null default '{}',
  tonnage_mt     int,
  raw            jsonb not null,
  first_seen_at  timestamptz not null default now()
);
create index on core.emails (sender_domain);

create table core.email_runs (
  id           bigserial primary key,
  run_id       uuid not null references core.runs(id) on delete cascade,
  email_id     text not null references core.emails(email_id),
  stage        text not null check (stage in ('ingested','classifying','classified','comparing','review','done','failed')),
  priority     int not null default 600,
  attempt      int not null default 0,
  outcome      text,
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  unique (run_id, email_id)
);
create index on core.email_runs (run_id, stage);

create table core.attachments (
  id            bigserial primary key,
  run_id        uuid not null references core.runs(id) on delete cascade,
  email_id      text not null references core.emails(email_id),
  filename      text not null,
  source_path   text not null,
  role          text check (role in ('SI','BL','UNKNOWN')),
  origin        text not null default 'source' check (origin in ('source','human')),
  object_key    text not null,
  content_type  text not null,
  bytes         int not null,
  sha256        text not null,
  created_at    timestamptz not null default now(),
  unique (run_id, email_id, filename)
);
```

`migrate.mjs` must set `search_path = core, public` per connection, or every query uses the
`core.` prefix. Decision: always prefix. `db.ts` exports `pool` and `withTx(fn)`.

### 6. Contracts: `src/contracts.ts`

zod schemas and derived types shared by routes and the frontend mirror:

```ts
export const RunStatus = z.enum(["created","running","paused","completed","cancelled","failed"]);
export const Stage = z.enum(["ingested","classifying","classified","comparing","review","done","failed"]);
export const CreateRunBody = z.object({
  source: z.literal("averis").default("averis"),
  ratePerSecond: z.number().min(0).max(50).default(2),
  limit: z.number().int().positive().optional(),
  emailIds: z.array(z.string()).optional(),
});
export const RunSummary = z.object({
  id: z.string(), status: RunStatus, ratePerSecond: z.number(), totalEmails: z.number().nullable(),
  stageCounts: z.record(Stage, z.number()), queues: z.object({
    classify: z.object({ waiting: z.number(), active: z.number(), failed: z.number() }),
    compare:  z.object({ waiting: z.number(), active: z.number(), failed: z.number() }),
  }), createdAt: z.string(), startedAt: z.string().nullable(), finishedAt: z.string().nullable(),
});
export const EmailListItem = z.object({
  emailId: z.string(), from: z.string(), subject: z.string(), stage: Stage,
  attachmentCount: z.number(), outcome: z.string().nullable(),
});
```

### 7. Ingest: `src/ingest/`

`source.ts`:

```ts
export interface EmailRecord { email_id: string; from: string; subject: string; body: string; attachments: string[] }
export interface Source {
  listEmailIds(): Promise<string[]>;
  getEmail(id: string): Promise<EmailRecord>;
  readAttachment(path: string): Promise<{ bytes: Buffer; contentType: string }>;
}
```

`averis.source.ts`: `fetch` with a 15 s `AbortSignal.timeout`; 5xx and network errors →
`RetryableError`; 404 → `TerminalError`. Content type from response header, fallback by
extension (`txt`→`text/plain`, `pdf`→`application/pdf`,
`docx`→`application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
`xlsx`→`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).
`listEmailIds` calls `GET /emails` once and maps ids (sorted).

`__fakes__/memory.source.ts`: `MemorySource(records, attachments: Map<path, Buffer>)`.

`ingest-email.ts`, the unit of work, idempotent:

```
ingestEmail(deps, runId, emailId):
  record = source.getEmail(emailId)
  senderDomain = record.from.split("@")[1].toLowerCase()
  tonnage = parseTonnage(record.subject)          // /(\d{2,4})\s*MT\b/i  → int | null
  tx:
    emails.upsert(record, senderDomain, tonnage)
    if emailRuns.exists(runId, emailId): return    // idempotent re-run
    for path in record.attachments:
      { bytes, contentType } = source.readAttachment(path)
      key = keys.attachment(runId, emailId, basename(path))
      objectStore.put(key, bytes, contentType)
      attachments.insert({ runId, emailId, filename, sourcePath: path, role: roleFromName(filename), objectKey: key, contentType, bytes: bytes.length, sha256 })
    emailRuns.insert({ runId, emailId, stage: "ingested", priority: 600 })
  queues.classify.add("classify-email", { runId, emailId }, jobOptions(runId, emailId, 600))
```

`roleFromName`: `_SI.` → `SI`, `_BL.` → `BL`, else `UNKNOWN`. Priority is a constant this
phase; phase 9 replaces the constant with the formula.

`replay.ts`, the run controller, runs as a BullMQ processor on queue `ingest` (concurrency 1,
one job per run, `jobId = runId`):

```
processIngestRun(job{runId}):
  run = runs.get(runId); ids = run.email_ids ?? source.listEmailIds()
  if run.email_limit: ids = ids.slice(0, limit)
  runs.update(runId, { status: "running", total_emails: ids.length, started_at })
  done = set(emailRuns.emailIdsForRun(runId))
  for id in ids:
    if id in done: continue
    status = runs.status(runId)
    if status in (paused, cancelled): return          // job completes; resume adds a new job
    ingestEmail(deps, runId, id)
    job.updateProgress(done.size / ids.length)
    if run.rate_per_second > 0: await sleep(1000 / rate)
  runs.update(runId, { status: "completed" })        // ingestion complete; processing continues in queues
```

Run status `completed` means ingestion finished. The dashboard derives "processing finished"
from `stageCounts.done + failed == totalEmails`.

### 8. Storage: `src/storage/`

```ts
export interface ObjectStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Promise<NodeJS.ReadableStream>;
  exists(key: string): Promise<boolean>;
}
```

`minio.store.ts` implements it with the `minio` client; `__fakes__/memory.store.ts` for tests.
`keys.ts`:

```ts
attachment(runId, emailId, filename) => `runs/${runId}/emails/${emailId}/attachments/${filename}`
text(runId, emailId, filename)       => `runs/${runId}/emails/${emailId}/text/${filename}.txt`
page(runId, emailId, filename, n)    => `runs/${runId}/emails/${emailId}/pages/${filename}/${n}.png`
upload(caseId, filename)             => `uploads/${caseId}/${filename}`
submission(runId, ts)                => `submissions/${runId}/${ts}.json`
```

### 9. Queues: `src/queues/`

`connection.ts`: one `IORedis` with `maxRetriesPerRequest: null` (BullMQ requirement).

`names.ts`:

```ts
export const QUEUES = { ingest: "ingest", classify: "classify", compare: "compare" } as const;
export const ClassifyJob = z.object({ runId: z.string().uuid(), emailId: z.string() });
export const CompareJob  = ClassifyJob.extend({ rerunFrom: z.enum(["triage","extract","compare"]).optional() });
export const IngestJob   = z.object({ runId: z.string().uuid() });
export function jobOptions(runId, emailId, priority): JobsOptions {
  return { jobId: `${runId}:${emailId}`, priority, attempts: 3,
           backoff: { type: "exponential", delay: 5000 },
           removeOnComplete: { age: 86400 }, removeOnFail: false };
}
```

`queues.ts`: creates the three `Queue` objects; `queueCounts(name)` returning
`{ waiting, active, failed, delayed }` via `getJobCounts`.

`processors/classify.processor.ts` (this phase):

```
parse ClassifyJob; emailRuns.setStage(runId, emailId, "classifying")
emailRuns.setStage(runId, emailId, "classified")
queues.compare.add("compare-email", { runId, emailId }, jobOptions(runId, emailId, priority))
```

`processors/compare.processor.ts` (this phase): set stage `done`, `outcome = "OK"`,
`finished_at = now()`.

`workers.ts`: builds `Worker` instances with `concurrency` from config, `lockDuration: 120000`,
`stalledInterval: 30000`. Event handlers: `failed` → `emailRuns.setStage(..., "failed", error)`
only when `job.attemptsMade >= job.opts.attempts` (final failure); otherwise increment
`attempt`. Processors throw `TerminalError` → call `job.discard()` before rethrowing.

`src/worker.ts`: boot config, logger, pool, redis, object store, source; start the three
workers; handle `SIGTERM`/`SIGINT` by `await Promise.all(workers.map(w => w.close()))` then
`pool.end()`.

### 10. Repositories: `src/ontology/repositories/`

One module per aggregate, plain functions taking a `Queryable` (pool or client):

- `runs.repo.ts`: `create`, `get`, `list`, `update(id, patch)`, `status(id)`.
- `emails.repo.ts`: `upsert`, `get`, `listForRun(runId, filters, page)`.
- `email-runs.repo.ts`: `insert`, `exists`, `emailIdsForRun`, `setStage(runId, emailId, stage, extra?)`,
  `stageCounts(runId)`, `incrementAttempt`.
- `attachments.repo.ts`: `insert`, `listForEmail(runId, emailId)`.

Row → domain mapping functions live in the same file (`toRun(row)`). No SQL outside this folder.

### 11. Routes: `src/routes/`

Mounted in `app.ts` behind the existing bearer middleware. Bodies validated with the schemas
from `contracts.ts`; invalid → 400 with zod issues.

| Route | Handler |
|---|---|
| `POST /runs` | create run row (status `created`), add `ingest` job `{runId}` with `jobId = runId`, return `RunSummary` (201) |
| `GET /runs` | list, newest first, each with `stageCounts` |
| `GET /runs/:id` | `RunSummary` |
| `POST /runs/:id/pause` | status `paused` (controller exits on next tick) |
| `POST /runs/:id/resume` | status `running`, add ingest job with `jobId = ${runId}:resume:${Date.now()}` |
| `POST /runs/:id/cancel` | status `cancelled`; also `queue.remove` for waiting jobs of this run (iterate `getJobs(["waiting","delayed"])`, filter by id prefix) |
| `GET /runs/:id/emails?stage=&q=&page=&pageSize=` | `EmailListItem[]` plus `total` |
| `GET /health` | extended, no auth |

`/health` shape:

```json
{ "status": "ok" | "degraded", "checks": { "postgres": "up", "redis": "up", "minio": "up", "averis": "up" } }
```

Each check has a 2 s timeout; `degraded` if any is down; HTTP 200 either way (auto-deploy
polls it; phase 3 decides whether degraded should fail the deploy).

### 12. Frontend

- `middleware.ts`: every path except `/login`, `/api/login`, `_next/*`, `favicon.ico` requires
  cookie `retina_session` equal to `HMAC-SHA256(SESSION_SECRET, "retina")` hex (Web Crypto,
  edge runtime). Missing or wrong → redirect `/login`.
- `app/login/page.tsx`: password form posting to `app/api/login/route.ts`, which compares to
  `SITE_PASSWORD` and sets the HttpOnly, Secure, SameSite=Lax cookie for 7 days.
- `lib/api-client.ts`: add `createRun`, `listRuns`, `getRun`, `listRunEmails`, `pauseRun`,
  `resumeRun`, `cancelRun`; mirror the contract types by hand.
- `app/runs/page.tsx`: server component fetching `listRuns`; client component
  `RunsTable` polling `/api/runs` route handler every 3 s with SWR; "New run" form with rate
  and limit; per-row stage counts and pause/resume/cancel buttons.
- Route handlers under `app/api/*` are thin proxies to `api-client.ts` so client components
  never hold the secret.
- Remove or hide the template's demo chat page from navigation (keep the code).

### 13. Tests

`backend/test/`:

- `setup.ts`: creates a pool to `DATABASE_URL` (test DB `retina_test`, migrated in a global
  setup), wraps each test in a transaction with rollback.
- `repositories/*.test.ts`: insert and read back for each repo; `stageCounts` grouping;
  `email_runs` uniqueness.
- `ingest/ingest-email.test.ts`: with `MemorySource`, `MemoryStore`, a fake queue
  (records `add` calls): inserts rows, stores attachments with correct keys and sha256, is
  idempotent on second call, parses tonnage from `__138MT`, assigns roles from filenames.
- `ingest/replay.test.ts`: respects `limit`, `emailIds`, skips already-ingested ids, stops when
  status becomes `paused`.
- `queues/names.test.ts`: `jobOptions` shape and job id format.
- `routes/runs.test.ts`: `createApp` with fakes, `POST /runs` validation, 401 without bearer.

### 14. Manual verification

```bash
docker compose -f backend/compose.local.yaml up -d
cd backend && pnpm db:migrate && pnpm dev            # terminal 1
pnpm dev:worker                                      # terminal 2
curl -s -X POST localhost:8091/runs -H "authorization: Bearer $TEAM_API_KEY" \
  -H 'content-type: application/json' -d '{"ratePerSecond":5}' | jq .id
curl -s localhost:8091/runs/<id> -H "authorization: Bearer $TEAM_API_KEY" | jq .stageCounts
docker compose -f backend/compose.local.yaml exec postgres psql -U retina retina_dev \
  -c "select stage, count(*) from core.email_runs group by 1"
# kill the worker mid-run, restart it, confirm the run completes with 520 rows and no duplicates
```

Open `http://localhost:3000/runs`, log in, watch counts move.

## Exit checklist

- [ ] `POST /runs {ratePerSecond: 5}` ingests all 520 emails; `email_runs` has 520 rows at `done`.
- [ ] Every attachment exists in MinIO under the run prefix with matching `sha256` (250 objects).
- [ ] Killing the worker mid-run and restarting finishes the run with no duplicate rows and no stuck `classifying`/`comparing` rows.
- [ ] Pause stops ingestion within one tick; resume continues from the next email.
- [ ] `/runs` page shows counts moving while a run is in progress; unauthenticated visit redirects to `/login`.
- [ ] `/health` reports all four checks up; stopping MinIO flips it to `degraded`.
- [ ] `pnpm test` and `pnpm type-check` pass; no `process.env` outside `config.ts`.
- [ ] `PROGRESS.md` created from the template, phase 1 checked off.

## Hand-off notes for phase 2

- The classify processor is the only place phase 2 changes (add rules + persistence).
- The compare processor writes a placeholder `comparisons` row in phase 2.
- `emails.tonnage_mt` and `sender_domain` exist for phase 9's priority; do not compute priority yet.
