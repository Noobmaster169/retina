# Phase 10 handover: what phase 9 built, and what the phase 10 spec gets wrong

Written 2026-09-20, after phase 9's exit checklist went green. Nothing below is a plan; it is all
on `phase-09-priority-and-ops`.

Read in this order:

1. **Section 1 of this file, before you write a line of SQL.** Four things in the phase 10 spec do
   not match the schema that exists, and one of them is a migration number that would silently
   never run.
2. `docs/phases/phase-10-analytics-and-chat.md`, the work list.
3. Sections 2 to 7 here.
4. `docs/phases/phase-08-handover.md` sections 6 and 10. The shell contract and the trap list are
   unchanged, and phase 9 added a destination without breaking either.
5. `docs/03-infra-deep.md` sections 4, 8, 10, 11 and 16.

---

## 1. Five things in the phase 10 spec are wrong, checked against the live database

Every one of these was verified against `information_schema` on the local stack, not read off a
design doc. Correct the spec in the same commit as the code, per `CLAUDE.md` rule 5.

**The migration numbers, again.** The spec says `009_analytics.sql`, `010_ro_role.sql`,
`011_chat.sql`. Phase 9 took `009` for `009_clients_seed.sql`. Yours are `010`, `011`, `012`.
`db/migrate.mjs` applies by filename, so a duplicate number is a migration that silently never
runs, and this is the third phase running that the spec has got it wrong. Check
`ls backend/db/migrations/` before you name a file.

**`core.field_diffs` has no `judge_used` column.** `fact_field_diff` selects it and the view will
not create. The real columns are:

```
id, comparison_id, field, si_value, bl_value, same, missing, confidence, rationale
```

`same` is the judge's verdict and `confidence` is how sure it was. If you want "did a model judge
this pair", that is what `rationale is not null` means; decide which you meant and write it down.

**Nothing is ever `decided_by = 'rule'`.** `agg_run_stage` counts it and will report 0 forever.
There are two different `decided_by` columns and neither has that value:

- `core.classifications.decided_by` is `llm | verifier | human`, ours, meaning which layer settled
  the category.
- `core.comparisons.decided_by` is `llm | human`, added by phase 8.

The organisers' own submission enum has `rule` and `llm`, and that is the only place the word
belongs. `PROGRESS.md` phase 8 records why our submission always reports `llm`. A count of
rule-decided emails is a count of something this product does not do, on purpose:
**no hand-written rule decides a category.** Drop the column from the view rather than making it
true.

**`coalesce(cl.tier, 3)` hardcodes the default tier.** It is right today, and it is right because
`DEFAULT_TIER` in `backend/src/contracts.clients.ts` is 3. Two places holding the same number with
nothing tying them together is how they drift. The seed only ranks nine domains, so the six
phishing senders really do come through this coalesce; it is exercised, not theoretical.

**`analytics.dim_client` is thinner than `/clients`.** The spec's view is
`select domain, name, tier, kind from core.clients`, which sees only ranked senders. The clients
page deliberately drives off `core.emails` instead, so a sender nobody ranked is still on it. If a
chat answer about clients disagrees with the clients page, this is why. `clients.repo.ts:list` has
the query to copy.

## 2. What phase 9 actually built

| Where | What it is |
|---|---|
| `db/migrations/009_clients_seed.sql` | The nine domains the organisers' kit names, all at the default tier |
| `src/contracts.clients.ts` | `ClientRow`, `ClientList`, `ClientUpdate`, `DEFAULT_TIER` |
| `src/contracts.health.ts` | Split out of `contracts.ts`. **The deploy gate greps this shape; see section 4** |
| `src/queues/priority.ts` | Pure. `tier * 200 - min(floor(tonnage / 10), 99)` |
| `src/queues/priority-cache.ts` | The `client:priority` hash behind one interface, with a memory fake |
| `src/queues/aging.ts` | One pass over one queue. One step of urgency per five minutes waited, computed from elapsed time so a pass is idempotent |
| `src/queues/heartbeat.ts` | `worker:heartbeat`, every 10 s, 60 s TTL |
| `src/queues/schedulers.ts` | The `scheduler` queue and its three repeatable jobs. **`refresh-analytics` goes here** |
| `src/health.ts`, `src/health-probes.ts` | What a reading means, and how each dependency answers. Two files on purpose |
| `src/routes/clients.routes.ts` | `GET /clients`, `PUT /clients/:domain` |
| `src/routes/request-log.ts` | A request id on every line and on the response |
| `src/ontology/repositories/clients.repo.ts` | Every sender seen, full-outer-joined to `core.clients` |
| `src/ontology/repositories/email-runs.submission.ts` | Split out of the repo, beside `email-runs.trace.ts` |
| `scripts/load-test.ts` | A burst, and what it cost |
| `frontend/app/clients/` | The page. The one destination that is not run-scoped |

## 3. Where your four pieces plug in

**`refresh-analytics` is one entry in `SCHEDULED` and one branch in `runTask`**, both in
`src/queues/schedulers.ts`. Do not put it in cron on the box: the box runs one crontab nobody
reviews, and a scheduled job there is invisible to anyone reading this repository.

`startSchedulers` takes an optional `queueName` **and an optional `aging`**. Pass both in a test.
A test against the real `scheduler` queue calls `obliterate` on it and silently unregisters a
running worker's heartbeat and aging pass for the rest of the day; and without `aging`, the test's
own scheduler walks the real `classify` and `compare` of a worker sharing that Redis. Phase 9 shipped
the first half of that isolation and a review found the second.

The spec also wants a refresh triggered when a run finishes. There is no run-completion event
today: `resolve-case.ts` runs per email and `processingDone` is computed in the run summary, not
raised. The cheap honest version is for the five-minute job to refresh only runs whose
`max(finished_at)` moved since the last refresh, and the spec's "and triggered when a run reaches
done + failed == total" is a second mechanism that needs one.

**`roPool` needs an error listener.** This is section 5 and it is the most expensive thing in this
file.

**The three HTTP probes sit behind `Probes`** (`src/health-probes.ts`) with `FakeProbes` beside
them, so a health test never dials a real service. If phase 10 adds a check, add it there: a test
that reaches the llm-proxy is banned outright by `CLAUDE.md`, and phase 9 wrote one before a review
caught it.

**`/chat` already exists as a destination**, marked `planned: "phase 10"` in
`components/shell/nav.ts`. Deleting that one field is what ships it. The 340px chat column on the
email page is also already drawn and inert, from phase 7. Do not add a second shell, a second nav
pattern, or a page outside `app/runs/[id]/` for anything run-scoped; `/clients` is the one
exception and `Destination.global` is the one field that allows it.

**`llm_calls` with `run_id = null`.** Every chat loop iteration is a row. Check that the run page's
queries filter by `run_id` rather than assuming every call belongs to a run, or a chat session will
appear in a run's cost.

## 4. If you change `/health` again, grep `deploy/` before you finish

Phase 9 changed the health report's shape, and it reached three places outside the api:

- `frontend/lib/api/queues-schemas.ts` mirrors it, and the rail's chips read it.
- `deploy/lib/stack.sh` gates the deploy on it **by substring**. It gated on `"postgres":"up"`,
  which a nested check does not contain: unchanged, it would have failed every deploy's health
  check and rolled back a working image. It accepts both shapes now, because a rollback restores
  the older image and that image has to pass the same gate.
- `deploy/sim/sim.sh` asserted the same substrings.

Nothing type-checks a shell script against a zod schema. This is the one contract in the repo with
no compiler behind it.

## 5. The api used to die instead of reporting an outage

`getPool()` had no `error` listener. Postgres dropping its idle connections is reported on the
pool, and Node treats an emitter's `error` with no listener as fatal, so the process exited. That
meant `/health` could not answer 503 when Postgres was down, which is the exact reading
`auto-deploy.sh` rolls back on, and on the box the api container would have crash-looped through
every Postgres restart.

Fixed in `src/db.ts`, held by `test/db.test.ts`. **Phase 10 adds a second pool.** `roPool` for
`DATABASE_RO_URL` needs the same listener, and `db.test.ts` is the place to hold it. This
generalises past pools: anything long-lived that emits `error` and has no listener takes the
process with it.

## 6. The tension phase 9 found, which the demo has to know about

**Aging beats tier, and on this proxy it beats it quickly.**

They are in tension by design. Tier says a client goes first; aging says nobody waits forever.
Aging wins after five minutes and wins completely after twenty, because four passes take any
priority to 1 and a job at 1 is indistinguishable from any other job at 1.

That matters because of throughput. The `claudecli` provider serves about half a request a second,
and an email costs several model calls, so a burst of fifty comparison emails is fifteen minutes of
work. Measured, not guessed: in the phase 9 burst a tier-1 email sat at 190 while eight tier-3
emails that had waited longer sat at 1 ahead of it, which is the anti-starvation guarantee working
exactly as written.

So a demo of tiers is a demo of the **first few minutes** of a burst. `AGE_AFTER_MS` and `AGE_STEP`
in `aging.ts` are the two numbers, and moving either is a decision about which of the two exit
checklist lines you would rather have. Do not change one without writing down which.

## 7. Traps phase 9 added to the list

- **`changePriority` updates `job.priority` and leaves `job.opts.priority` alone.** The options
  hold what the job was added with. This caught phase 9 three separate times: an aging pass that
  read them recomputed the same first step forever, and the classify processor handed the compare
  job the priority it had before it waited. Writing the trap down in `aging.ts` did not stop the
  same mistake being made in `workers.ts` an hour later, so **grep for `opts.priority` before you
  trust any priority you did not just set**.
- **BullMQ never moves `job.timestamp`.** A pass that promotes anything older than a threshold
  promotes it again on every run. Aging computes its target from elapsed time now
  (`aging.ts:targetFor`) precisely so a pass is idempotent; anything phase 10 schedules against a
  job's age inherits this.
- **Two untyped parameters inside one `coalesce` are both inferred as text**, which Postgres then
  refuses to write into a `smallint`. The clients upsert casts every parameter. What this looks
  like is a route whose body validated fine answering 500. **Phase 10 writes a lot of SQL; this is
  the one to remember.**
- **BullMQ reads priority 0 as "no explicit priority" and serves those ahead of every prioritised
  job.** It is not the top of the range, it is outside it. Aging stops at 1.
- **A dev box accumulates workers.** Four generations of `pnpm dev:worker` from earlier sessions
  were all consuming the same Redis queues, one pointed at a doc-extract URL ending `/nope`. A
  burst came back 36 failed out of 52 with `doc-extract returned 404` and nothing in this
  repository was wrong. Before you read a run, check there is exactly one worker.
- **Runs cost real tokens.** The `claudecli` provider is a subscription, and the user is working
  against a limited budget. `pnpm test` is free (no test may hit the real proxy; they use fakes and
  recorded fixtures), but every burst run and every `pnpm load-test` spends. Use `--limit`, and
  reuse a run that already exists rather than starting another.
- Everything in `phase-08-handover.md` section 10 and `phase-09-handover.md` section 7 is still
  true.

## 8. Open, and deliberately not built

- **The chat's proposed action card.** Third phase running, and **phase 10 is the one that has to
  settle it**, because phase 10 builds the chat. `POST /review/:id/actions` is a real route with a
  real body; what is missing is the rule for what a turn may write and who applies it. The phase 10
  spec is explicit that write tools are out of scope, so the honest outcome may be to specify the
  contract in `03-infra-deep.md` section 5.5 and build it in phase 11. Either way, stop carrying it
  as an unanswered question.
- **The action bar on an email that was never escalated.** Every write path is addressed by a case
  id and `review_cases` exist only for escalations. The bar is present and disabled there with one
  sentence saying why. Same gap, same answer: a contract first.
- **`GET /review/stats`** is built, tested and drawn nowhere. `reviewCases.stats(db, null)` returns
  failures across every run plus `resolvedToday` and `medianResolveMs` over the last week. If phase
  10 builds an operations view, those are its numbers and they cost nothing.
- **A run that is `completed` but still working cannot be cancelled.** `status` is the ingest's and
  `processingDone` is the pipeline's; the api refuses pause and cancel once ingest finishes, so the
  run page offers neither. Phase 9 did not touch it: it is a rule about run state, not about queue
  order. It bit this phase while stopping a load test.
- **Rendered page images** for an unreadable case. `/files/*key` exists and `docExtract.render`
  writes the PNGs. Still `[~]` in `04-phases.md`.
- **The full 520-email load test**, and phase 6's holdout, and phase 5's and phase 4's open items.
  All still the user's; `PROGRESS.md` lists them.

## 9. Running it

```bash
docker compose -f compose.local.yaml up -d   # inside backend/
pnpm db:migrate && pnpm dev                  # api on :8091
pnpm dev:worker                              # in another shell, and only one
pnpm dev                                     # inside frontend/, :3000
```

`pnpm test` in `backend/` (537) and in `frontend/` (40), neither touching the proxy. `pnpm lint` in
`frontend/` enforces the 200 line rule; tests are exempt.

To see phase 9 working without spending a token:

```bash
curl -s 127.0.0.1:8091/health | python -m json.tool
```

All seven checks with their own detail, the build, and the queue depths. `/clients` shows every
sender the inbox has seen; ranking one writes Postgres and the `client:priority` hash in the same
second. The aging pass logs `promoted a job that had waited` once a minute while anything is
queued.
