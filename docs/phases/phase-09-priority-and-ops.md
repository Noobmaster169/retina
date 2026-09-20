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
`db/migrate.mjs` applies by filename, so a duplicate number is a migration that never runs):
insert the domains the organisers' own kit names as parties to a shipment, every one at the
default tier. Internal: `aprilasia.com`, `april.com.my` (kind `internal`). Customers:
`fujitogrp.com`, `psabdp.com`, `algurg.ae`, `safqa.co.ke`, `roxcel.at`, `ifpla.com`,
`vitalsolutions.sg`. Tiers only order the queue; they never decide a category. Tiers are edited
by hand; the demo sets two customers to tier 1.

**Not "every sender domain seen in the dataset".** Fifteen domains appear; the other six are the
phishing senders, and seeding those would be a sender list fitted to one seed of one dataset,
which `CLAUDE.md` bans and which the judges' dataset would not match. They reach the queue at the
tier-3 default like any unknown sender.

`clients.kind = 'spam'` stays in the schema as a label a person can set. Nothing reads it to
classify: the LLM classifies every email, and no sender list overrides it.

Routes: `GET /clients` lists **every sender domain in `core.emails`**, full-outer-joined to
`core.clients`, with counts of emails and mismatches. That is what puts all fifteen on the page:
an unseeded sender shows its defaults and `known: false`, so the page can say nobody chose them.
`PUT /clients/:domain { name?, tier?, kind? }` upserts and writes the Redis cache immediately.
Page `/clients`: table with inline tier editor and kind selector. It is the one destination that
is **not** run-scoped, because a tier is a standing decision about a sender and not a property of
one replay; `Destination.global` in `components/shell/nav.ts` is the one field that allows it.

### 2. Priority: `src/queues/priority.ts` (pure) plus cache

```ts
computePriority({ tier, tonnageMt }): number
  tier        = tier ?? 3                       // 1 highest, 5 lowest
  tonnage     = tonnageMt ?? 0
  bonus       = Math.min(Math.floor(tonnage / 10), 99)
  return tier * 200 - bonus                     // range 101..1000; lower is served first
```

Never 0: BullMQ reads 0 as "no explicit priority" and serves those **ahead** of every prioritised
job, so 0 is not the top of the range but outside it.

Cache: Redis hash `client:priority` (`domain -> tier`). `ingest-email.ts` reads
`HGET client:priority <domain>` (fallback 3) and passes the priority to both the `classify`
job and, later, the `compare` job (the classify processor forwards `job.opts.priority`).
`email_runs.priority` stores it.

Because the `classify` queue is only relevant while ingestion outruns classification, the
visible effect is in the `compare` queue during bursts. The demo uses a burst run (rate 0)
with two tier-1 domains.

### 3. Aging

Scheduler job `age-waiting-jobs` every 60 s: for each of `classify` and `compare`,
`queue.getJobs(["waiting", "prioritized"], 0, 500)` (a job with a priority waits in
`prioritized`); for jobs with `Date.now() - job.timestamp > 5 min` and a priority above 1, call
`job.changePriority({ priority: Math.max(1, priority - 100) })` and log.

Aging **promotes**: BullMQ serves the lowest number first, so subtracting moves a job up. A
person's rerun is therefore not exempt, because there is nothing to exempt it from.

`changePriority` exists and works on BullMQ 6.3.6, and `test/queues/aging.test.ts` holds it
against a real Redis. **It updates `job.priority` and leaves `job.opts.priority` at whatever the
job was added with**, so a pass that reads the options recomputes the same first step forever: a
job went 1000 to 900 and stayed there however long it waited.

### 4. Schedulers: `src/queues/schedulers.ts`

Uses BullMQ repeatable jobs on a `scheduler` queue with `jobId` per task so restarts do not
duplicate them (`queue.upsertJobScheduler` or `add` with `repeat` and a fixed `jobId`,
depending on the BullMQ version installed).

| Job | Every | Does |
|---|---|---|
| `refresh-priority-cache` | 1 h and at worker boot | `clients` → `client:priority` hash |
| `age-waiting-jobs` | 60 s | work item 3 |
| `heartbeat` | 10 s | `SET worker:heartbeat <iso> EX 60`. New in this phase; there is no ad hoc write to move |

**`expire-counters` is not built**, and the spec was wrong to ask for it: `run:{id}:counters`
does not exist. Phase 7 drew its counters from Postgres, and the one ephemeral Redis key there
is (`live:call:*`) carries its own 900 s TTL. A scheduled job that expires nothing is a line in
the runbook that is not true. `03-infra-deep.md` section 4.1 is corrected to match.

The first heartbeat and the first cache refresh happen at boot, before the schedulers are
registered: ten seconds of a worker that is running reading as one that is not is long enough
for a deploy's health gate to see it.

Phase 10 adds `refresh-analytics`; phase 11 adds `draft-lessons`.

### 5. Health

`GET /health` final shape:

```json
{
  "status": "ok" | "degraded" | "down",
  "checks": {
    "postgres": { "status": "up", "latencyMs": 3 },
    "redis": { "status": "up", "latencyMs": 1 },
    "minio": { "status": "up", "latencyMs": 2 },
    "inbox": { "status": "up", "latencyMs": 78, "emails": 520, "scoringAvailable": true },
    "docExtract": { "status": "up", "latencyMs": 49, "tesseract": "5.5.0" },
    "llmProxy": { "status": "up", "latencyMs": 52, "models": 4 },
    "worker": { "status": "up", "heartbeatAt": "..." }
  },
  "version": "<git sha from build arg>",
  "queues": { "classify": { "waiting": 0, "active": 0, "failed": 0 }, "compare": { ... } }
}
```

The check is `inbox`, not `averis`: that is the name phase 3 built, the name the rail's
dependency chips read, and `CLAUDE.md` rule 5 gives the repo the last word on what is already
built. Every detail comes free from the dependency's own health payload, so the route makes no
extra call to get it.

`down` when postgres or redis is down (HTTP 503); `degraded` when anything else is down or
the worker heartbeat is older than 60 s (HTTP 200). `auto-deploy.sh` treats 503 as failure
and 200 as success, logging the degraded checks. The Dockerfile passes `GIT_SHA` as a build
arg into `config.version`; CI passes it too, so a registry image carries its commit.

**The shape change reaches the deploy scripts.** `retina_health_ready` in `deploy/lib/stack.sh`
gated on the substring `"postgres":"up"`, which a nested check does not contain: left alone it
would have failed every deploy's health check and rolled back a working image. It accepts both
shapes now, because a rollback puts the older image back and has to pass its own gate.

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

- `queues/priority.test.ts`: formula table (tier 1 and 500 MT → **150**, not 151: 200 - 50;
  tier 5 and 0 MT → 1000; clamps; and the property that a tier always beats the tier below it
  whatever the tonnage).
- `queues/aging.test.ts`: against a real Redis, because the question is what BullMQ's
  `changePriority` actually does on the installed version.
- `queues/schedulers.test.ts`: idempotent registration (calling twice yields one repeatable
  per task) using a real local Redis.
- `health.test.ts`: `down` on postgres failure; a stale or absent heartbeat is `degraded` and
  never `down`; a Redis that cannot be read still produces a report.
- `routes/clients.test.ts`: `PUT` updates Postgres and the Redis hash, `GET` lists a sender
  nobody ranked, and a tier change writes no category.

**There is no `pipeline/classify/rules.test.ts` and there must not be.** The spec's line about a
"spam list injected from the set" describes a rule-based classifier, which `CLAUDE.md` bans
outright: the model classifies every email and no sender list overrides it. `kind = 'spam'` is a
label on a client row that nothing in the pipeline reads.

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
- [ ] A job waiting over 5 minutes has its priority raised by the aging job (visible in `/queues` and logs).
- [ ] In-flight LLM calls never exceed `LLM_MAX_CONCURRENCY`. Two readings: the semaphore's own
      peak, logged whenever it rises, and the peak overlap the load test sweeps out of
      `llm_calls`, which is the independent one.
- [ ] `/health` turns `degraded` within 60 s of stopping the worker and `down` (503) when Postgres is stopped.
- [ ] Both load-test durations recorded; zero 429s at concurrency 8.
- [ ] A tier changed through `/clients` reorders waiting jobs after the next refresh, and changes no category.

## Hand-off notes for phase 10

- The `scheduler` queue is where `refresh-analytics` goes; add it there rather than as a cron
  line on the box.
