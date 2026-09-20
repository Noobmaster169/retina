# Phase 10 handover: what phase 9 built, and what it left you

Written 2026-09-20, after phase 9's exit checklist went green. Nothing below is a plan; it is all
on `phase-09-priority-and-ops`.

Read in this order:

1. This file, all of it. Section 2 is the one that will save you the most time.
2. `docs/phases/phase-10-analytics-and-chat.md`, the work list.
3. `docs/phases/phase-08-handover.md` sections 6 and 10. The shell contract and the trap list are
   unchanged and still apply, and phase 9 added one destination without breaking either.
4. `docs/04-phases.md` phase 10, and `docs/03-infra-deep.md` sections 4, 10, 11 and 16.

---

## 1. What phase 9 actually built

| Where | What it is |
|---|---|
| `db/migrations/009_clients_seed.sql` | The nine domains the organisers' kit names, all at the default tier |
| `src/queues/priority.ts` | Pure. `tier * 200 - min(floor(tonnage / 10), 99)` |
| `src/queues/priority-cache.ts` | The `client:priority` hash behind one interface, with a memory fake |
| `src/queues/aging.ts` | One pass over one queue. Promotes anything waiting over five minutes |
| `src/queues/heartbeat.ts` | `worker:heartbeat`, every 10 s, 60 s TTL |
| `src/queues/schedulers.ts` | The `scheduler` queue and its three repeatable jobs. **Add `refresh-analytics` here** |
| `src/health.ts`, `src/health-probes.ts` | What a reading means, and how each dependency answers. Two files on purpose |
| `src/routes/clients.routes.ts` | `GET /clients`, `PUT /clients/:domain` |
| `src/routes/request-log.ts` | A request id on every line and on the response |
| `scripts/load-test.ts` | A burst, and what it cost |
| `frontend/app/clients/` | The page. The one destination that is not run-scoped |

## 2. The thing phase 9 learnt that its own spec did not know

**Aging beats tier, and on this proxy it beats it quickly.**

The two are in tension by design. Tier says a client goes first; aging says nobody waits forever.
Aging wins after five minutes and wins completely after twenty, because four passes take any
priority to 1 and a job at 1 is indistinguishable from any other job at 1.

That matters because of throughput. The `claudecli` provider serves about half a request a second,
and an email costs several model calls, so a burst of fifty comparison emails is fifteen minutes of
work. By minute ten, everything still queued has aged to the front and the tier has stopped
deciding anything. Measured, not guessed: in the phase 9 burst, a tier-1 email sat at 190 while
eight tier-3 emails that had waited longer sat at 1 ahead of it, which is the anti-starvation
guarantee working exactly as written.

So a demo of tiers has to be a demo of the **first few minutes** of a burst, and phase 12 should
know that before it scripts one. If you want the tier to hold longer, `AGE_AFTER_MS` and `AGE_STEP`
in `aging.ts` are the two numbers, and moving either is a decision about which of the two exit
checklist lines you would rather have. Do not change one without writing down which.

## 3. The api used to die instead of reporting an outage

`getPool()` had no `error` listener. Postgres dropping its idle connections is reported on the
pool, and Node treats an emitter's `error` with no listener as fatal, so the process exited. That
meant `/health` could not answer 503 when Postgres was down, which is the exact reading
`auto-deploy.sh` rolls back on, and on the box the api container would have crash-looped through
every Postgres restart.

Fixed in `src/db.ts`, held by `test/db.test.ts`. The lesson generalises: **anything phase 10 adds
that holds a long-lived connection needs an error listener**, and the read-only pool the chat
agent's `run_sql` uses (`DATABASE_RO_URL`, `03-infra-deep.md` section 8.3) is the next one.

## 4. Where analytics goes

- **The scheduler, not the box.** `refresh-analytics` is one entry in `SCHEDULED` and one branch in
  `runTask`. `startSchedulers` takes a `queueName` so a test can register against its own queue;
  use it, because a test that obliterates the real `scheduler` queue silently unregisters a running
  worker's heartbeat and aging pass.
- **`analytics` schema already exists** in `03-infra-deep.md` section 8.2 and nothing writes it.
- **`GET /review/stats`** is still built, tested and drawn nowhere. `reviewCases.stats(db, null)`
  returns failures across every run plus `resolvedToday` and `medianResolveMs` over the last week.
  If phase 10 builds an operations view, those are its numbers and they cost nothing.

## 5. Contracts phase 9 added, and the one it changed

`contracts.clients.ts` is new and additive. `HealthReport` is a **shape change**, and it reached
further than the two sides of the api:

- `frontend/lib/api/queues-schemas.ts` mirrors it, and the rail's chips read it.
- `deploy/lib/stack.sh` gates the deploy on it by substring. It gated on `"postgres":"up"`, which a
  nested check does not contain: unchanged, it would have failed every deploy's health check and
  rolled back a working image. It accepts both shapes now, because a rollback puts the older image
  back and that image has to pass the same gate.
- `deploy/sim/sim.sh` asserted the same substrings and is updated with it.

**If phase 10 changes `/health` again, grep `deploy/` before you finish.** Nothing type-checks a
shell script against a zod schema.

## 6. Traps phase 9 added to the list

- **`changePriority` updates `job.priority` and leaves `job.opts.priority` alone.** The options
  hold what the job was added with. An aging pass that read them recomputed the same first step
  forever: 1000 to 900, and 900 for as long as the job waited.
- **Two untyped parameters inside one `coalesce` are both inferred as text**, which Postgres then
  refuses to write into a `smallint`. The clients upsert casts every parameter. A route whose body
  validated fine answering 500 is what this looks like.
- **BullMQ reads priority 0 as "no explicit priority" and serves those ahead of every prioritised
  job.** It is not the top of the range, it is outside it. Aging stops at 1.
- **A dev box accumulates workers.** Four generations of `pnpm dev:worker` from earlier sessions
  were all consuming the same Redis queues, one of them pointed at a doc-extract URL ending
  `/nope`. A burst came back 36 failed out of 52 with `doc-extract returned 404`, and nothing in
  this repository was wrong. Before you read a run, check there is one worker.
- Everything in `phase-08-handover.md` section 10 is still true, and `phase-09-handover.md`
  section 7 with it.

## 7. Open, and deliberately not built

- **The chat's proposed action card**, third phase running. `POST /review/:id/actions` is a real
  route with a real body; what is missing is the rule for what a turn may write and who applies it.
  **Phase 10 builds the chat, so this is the phase that has to settle it.** Specify it in
  `03-infra-deep.md` section 5.5 before writing the tool.
- **The action bar on an email that was never escalated.** Every write path is addressed by a case
  id and `review_cases` exist only for escalations. The bar is present and disabled there with one
  sentence saying why. Same gap, same answer: a contract first.
- **Rendered page images** for an unreadable case. `/files/*key` exists and `docExtract.render`
  writes the PNGs. Still `[~]` in `04-phases.md`.
- **Phase 6's holdout and the full 520 run**, and phase 5's and phase 4's open items. All still the
  user's; `PROGRESS.md` lists them.

## 8. Running it

```bash
docker compose -f compose.local.yaml up -d   # inside backend/
pnpm db:migrate && pnpm dev                  # api on :8091
pnpm dev:worker                              # in another shell, and only one
pnpm dev                                     # inside frontend/, :3000
```

`pnpm test` in `backend/` (537) and in `frontend/` (40). `pnpm lint` in `frontend/` enforces the
200 line rule; tests are exempt.

To see phase 9 working:

```bash
curl -s -X PUT http://127.0.0.1:8091/clients/fujitogrp.com \
  -H "authorization: Bearer $TEAM_API_KEY" -H 'content-type: application/json' -d '{"tier":1}'
pnpm load-test --limit 40
```

`/clients` shows every sender the inbox has seen, the two you rank at the top. `/health` carries
all seven checks with their own detail. The aging pass logs `promoted a job that had waited` once a
minute while anything is queued.
