# Phase 9: Priority, concurrency, ops

## Goal

The queues behave like production queues: important clients first, nobody starved, the proxy
never overloaded, scheduled work runs inside the worker, and the system reports its own health
precisely enough that the dashboard and auto-deploy can trust it.

## Prerequisites

Phase 8 merged. `LLM_MAX_CONCURRENCY` semaphore from phase 4 in place. **The `worker:heartbeat`
key does not exist yet**: nothing in `backend/src/` writes one and `health.ts` checks postgres,
redis, minio, inbox and docExtract only. Writing it is this phase's work, not something inherited.

## Scope

In: client tiers, priority formula at enqueue, priority cache, aging, schedulers module,
health and heartbeat, structured logging audit, load test. Out: analytics views (phase 10),
lessons (phase 11).

## Work items

### 1. Clients

Seed migration `009_clients_seed.sql` (phase 8 took `008` for `008_review_actions.sql`, and
`db/migrate.mjs` applies by filename, so a duplicate number is a migration that never runs): insert every sender domain seen in the dataset with a
kind and default tier. Internal: `aprilasia.com`, `april.com.my` (kind `internal`, tier 3).
Customers and forwarders: `fujitogrp.com`, `psabdp.com`, `algurg.ae`, `safqa.co.ke`,
`roxcel.at`, `ifpla.com`, `vitalsolutions.sg` (kind `customer`, tier 3). Tiers only order the
queue; they never decide a category, and there is no spam list. Tiers are edited by hand; the demo sets two customers to
tier 1.

`clients.kind = 'spam'` stays in the schema as a label a person can set. Nothing reads it to
classify: the LLM classifies every email, and no sender list overrides it.

Routes: `GET /clients` (with counts of emails and mismatches per domain from a join),
`PUT /clients/:domain { name?, tier?, kind? }` (upsert; also writes the Redis cache
immediately). Page `/clients`: table with inline tier editor and kind selector.

### 2. Priority: `src/queues/priority.ts` (pure) plus cache

```ts
computePriority({ tier, tonnageMt }): number
  tier        = tier ?? 3                       // 1 highest, 5 lowest
  tonnage     = tonnageMt ?? 0
  bonus       = Math.min(Math.floor(tonnage / 10), 99)
  return tier * 200 - bonus                     // range 101..1000; lower is served first
```

Cache: Redis hash `client:priority` (`domain -> tier`). `ingest-email.ts` reads
`HGET client:priority <domain>` (fallback 3) and passes the priority to both the `classify`
job and, later, the `compare` job (the classify processor forwards `job.opts.priority`).
`email_runs.priority` stores it.

Because the `classify` queue is only relevant while ingestion outruns classification, the
visible effect is in the `compare` queue during bursts. The demo uses a burst run (rate 0)
with two tier-1 domains.

### 3. Aging

Scheduler job `age-waiting-jobs` every 60 s: for each of `classify` and `compare`,
`queue.getJobs(["waiting"], 0, 500)`; for jobs with `Date.now() - job.timestamp > 5 min` and
`priority > 100`, call `job.changePriority({ priority: Math.max(1, priority - 100) })` and
log. Verify `changePriority` on the installed BullMQ version during this phase (listed in the
deep dive's day-one checks); if unavailable, fall back to remove-and-re-add with the same
`jobId` suffixed `:aged`.

### 4. Schedulers: `src/queues/schedulers.ts`

Uses BullMQ repeatable jobs on a `scheduler` queue with `jobId` per task so restarts do not
duplicate them (`queue.upsertJobScheduler` or `add` with `repeat` and a fixed `jobId`,
depending on the BullMQ version installed).

| Job | Every | Does |
|---|---|---|
| `refresh-priority-cache` | 1 h and at worker boot | `clients` → `client:priority` hash |
| `age-waiting-jobs` | 60 s | work item 3 |
| `heartbeat` | 10 s | `SET worker:heartbeat <iso> EX 60`. New in this phase; there is no ad hoc write to move |
| `expire-counters` | 1 h | `EXPIRE run:{id}:counters 604800` for finished runs |

Phase 10 adds `refresh-analytics`; phase 11 adds `draft-lessons`.

### 5. Health

`GET /health` final shape:

```json
{
  "status": "ok" | "degraded" | "down",
  "checks": {
    "postgres": { "status": "up", "latencyMs": 3 },
    "redis": { "status": "up", "latencyMs": 1 },
    "minio": { "status": "up" },
    "docExtract": { "status": "up", "tesseract": "5.3.0" },
    "averis": { "status": "up", "emails": 520, "scoringAvailable": true },
    "llmProxy": { "status": "up", "models": 6 },
    "worker": { "status": "up", "heartbeatAt": "..." }
  },
  "version": "<git sha from build arg>",
  "queues": { "classify": { "waiting": 0, "active": 0, "failed": 0 }, "compare": { ... } }
}
```

`down` when postgres or redis is down (HTTP 503); `degraded` when anything else is down or
the worker heartbeat is older than 60 s (HTTP 200). `auto-deploy.sh` treats 503 as failure
and 200 as success, logging the degraded checks. The Dockerfile passes `GIT_SHA` as a build
arg into `config.version`.

### 6. Logging audit

- Every log line in processors carries `runId`, `emailId`, `stage`, `jobId`, `attempt`.
- LLM calls log `step`, `promptVersion`, `latencyMs`, `inputTokens`, `outputTokens`.
- Route logs use pino-http with request id; bodies never logged.
- Log levels: `info` for stage transitions and decisions, `warn` for retries and degraded
  checks, `error` for final failures. No `debug` left on in production config.

### 7. Load test

Script `backend/scripts/load-test.ts`: starts a burst run (rate 0) with all 520 emails and
polls `/runs/:id` until done, printing elapsed time, peak queue depth, and any `llm_calls`
with `error` containing `429`. Run with `CLASSIFY_CONCURRENCY=4 COMPARE_CONCURRENCY=4
LLM_MAX_CONCURRENCY=8`, then once with `LLM_MAX_CONCURRENCY=2` to confirm graceful slowdown
without failures. Record both durations in `PROGRESS.md`.

### 8. Tests

- `queues/priority.test.ts`: formula table (tier 1 and 500 MT → 151; tier 5 and 0 MT → 1000;
  clamps).
- `queues/schedulers.test.ts`: idempotent registration (calling twice yields one repeatable
  per task) using a real local Redis.
- `pipeline/classify/rules.test.ts` addition: spam list injected from the set, not hardcoded.
- `routes/health.test.ts`: `down` on postgres failure returns 503; stale heartbeat →
  `degraded`.
- `routes/clients.test.ts`: `PUT` updates Postgres and the Redis hash.

### 9. Manual verification

- Set `fujitogrp.com` and `algurg.ae` to tier 1 in `/clients`; start a burst run; on the run
  page sort the email table by `finishedAt`: their comparison emails finish before tier-3
  customers' comparison emails.
- Pause the worker during a burst so jobs wait more than 5 minutes; resume; logs show aging
  changes and `/queues` shows lowered priorities.
- `docker compose stop worker`; within 60 s `/health` shows `worker: degraded`; the dashboard
  header shows a warning badge.

## Exit checklist

- [ ] With two tier-1 domains and a burst run, their comparison emails complete before tier-3 emails.
- [ ] A job waiting over 5 minutes has its priority reduced by the aging job (visible in `/queues` and logs).
- [ ] In-flight LLM calls never exceed `LLM_MAX_CONCURRENCY` (assert with the semaphore's peak counter logged at the end of a run).
- [ ] `/health` turns `degraded` within 60 s of stopping the worker and `down` (503) when Postgres is stopped.
- [ ] Both load-test durations recorded; zero 429s at concurrency 8.
- [ ] A tier changed through `/clients` reorders waiting jobs after the next refresh, and changes no category.

## Hand-off notes for phase 10

- The `scheduler` queue is where `refresh-analytics` goes; add it there rather than as a cron
  line on the box.
