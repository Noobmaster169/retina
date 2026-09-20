# Phase 9 handover: what phase 8 built, and what it left you

Written 2026-09-20, after phase 8's exit checklist went green and merged. Nothing below is a plan;
it is all on `main`.

Read in this order:

1. This file, all of it.
2. `docs/phases/phase-09-priority-and-ops.md`, the work list. **Two things in it are already wrong
   and section 2 below says how.**
3. `docs/phases/phase-08-handover.md` sections 6 and 10. The shell contract and the trap list are
   unchanged and still apply.
4. `docs/04-phases.md` phase 9, and `docs/03-infra-deep.md` sections 4.3, 4.4 and 16.

---

## 1. The finding phase 7 wrote down, phase 8 did not fix, and phase 9 exists to fix

Still true, still yours, and it is the most valuable thing in this file.

BullMQ runs `CLASSIFY_CONCURRENCY` (8) plus `COMPARE_CONCURRENCY` (4) jobs at once, and all twelve
contend for the model slots `llmSlots(LLM_MAX_CONCURRENCY)` hands out. `config.ts` line 91 defaults
`LLM_MAX_CONCURRENCY` to `CLASSIFY_CONCURRENCY` alone rather than the sum, so eight classify jobs
can hold every slot while four compare jobs sit blocked in the semaphore. That is exactly the shape
of what the run page keeps showing: sorting unaffected, checking paused.

Either budget both concurrencies against one number, or make `LLM_MAX_CONCURRENCY` their sum and
raise `proxy.yaml`'s `max_concurrency` with it. Phase 8 left it alone because a UI phase is the
wrong place to change how many calls are in flight; phase 9's exit checklist already asks for the
assertion.

Measured ceilings, from memory rather than guesswork: the `claudecli` provider does about 0.5
requests a second, and ngrok falls over above roughly 64 sockets. Whatever number you pick, it has
to sit under those.

## 2. Two things in the phase 9 spec are already wrong

- **The migration number.** The spec says `008_clients_seed.sql`. Phase 8 took `008` for
  `008_review_actions.sql`. Yours is `009_clients_seed.sql`. `db/migrate.mjs` applies by filename,
  so a duplicate number is a migration that silently never runs.
- **The prerequisite about the heartbeat.** The spec says "`worker:heartbeat` key written since
  phase 7". It is not: nothing in `backend/src/` writes one, and `health.ts` checks postgres, redis,
  minio, inbox and docExtract and nothing else. Writing the heartbeat is phase 9's work, not
  something you inherit.

Correct both in the spec in the same commit as the code, per `CLAUDE.md` rule 5.

## 3. What phase 8 actually built

| Where | What it is |
|---|---|
| `db/migrations/008_review_actions.sql` | `core.review_actions`, plus `attachments.review_case_id`, `email_runs.rerun_count`, `comparisons.decided_by`. All additive with defaults |
| `src/review/actions.ts` | The transaction, the state guards, the answer. `applyEffect` is the one path every write goes through |
| `src/review/effects.ts` | One function per kind. Nothing here decides a value is correct |
| `src/review/upload.ts` | Extension allow-list, byte sniffing, the object, the attachment row |
| `src/review/rerun.ts` | Spends `rerun_count` and enqueues. **Read this before you touch priority** |
| `src/queues/record-failure.ts` | What a failed job leaves behind. Its own module so it tests without Redis |
| `src/queues/processors/resolve-case.ts` | Closes the open case when a stage ends without escalating |
| `src/routes/review.routes.ts`, `files.routes.ts` | The five review routes and the object stream |
| `frontend/components/review/` | The queue, the action bar, the strips, the reviewer's name |
| `frontend/components/email/email-pane.tsx` | The email page's middle column, lifted out so the queue opens the same pane |

## 4. A rerun is a job like any other, and priority has to know that

`review/rerun.ts` adds a rerun at `DEFAULT_PRIORITY`. When you replace that constant with tier and
tonnage, **the rerun has to take the priority the email already has**, or a tier-1 client's
correction queues behind a burst. `email_runs.priority` is already stored; `requeue` is three lines
and one of them is the priority.

Two more things that touch it:

- The rerun's job id is `${runId}__${emailId}__r{n}`. `emailIdOfJob` splits on `__` and takes index
  1, so it still answers correctly for a rerun. Anything phase 9 adds that parses a job id has to
  stay true for the suffix, including the aging job.
- The aging job lowers the priority of anything waiting over five minutes. A rerun a person just
  asked for is the last job in the queue that should age out, so decide deliberately whether it is
  exempt and write the reason down.

## 5. What `/health` does not say yet, and what is already stored for it

Phase 9 extends `/health` with a worker heartbeat. Two numbers phase 8 makes worth reporting beside
it, both already built and tested:

- **Open failure cases.** `reviewCases.stats(db, null)` returns `failures` across every run. A run
  with failure cases hit something permanent, and that is health, not review.
- **The queue's age.** The same call returns `resolvedToday` and `medianResolveMs` over the last
  week. Built, tested, drawn nowhere. If phase 9 wants an ops view, those are its numbers.

Remember what `/health` is for: only postgres down is a 503, and that is the signal auto-deploy
rolls back on. A degraded check is still 200. Do not let a heartbeat that is one cycle late roll
back a good image.

## 6. The seam the queues now have

`RunQueues` gained one method, and it is the only way a person's correction reaches a queue:

```ts
rerun(queue: "classify" | "compare", data: ClassifyJob, options: JobsOptions): Promise<void>
```

`MemoryRunQueues` records what would have been added, so every review test reads the job instead of
waiting for a worker. When phase 9 adds the schedulers, give them the same treatment: one interface,
one real implementation, one fake. `CLAUDE.md` calls this an explicit seam and it is why phase 8's
491 tests need no Redis.

## 7. Traps phase 8 added to the list

- **`UPDATE ... RETURNING` gives you the new row.** Both places that needed the value that stood
  before read it in a CTE first. Anything phase 9 writes that records a change inherits this.
- **A human value replaces the whole reading, not just the value.** `withHumanValues` drops the
  model's `source_quote`, placeholder and confidence with it. Leaving the quote told the field judge
  that a corrected weight was quoted from a line reading `N/A`, and the correction came straight
  back as the same escalation.
- **`pageConfidence` is 0 to 100.** tesseract's own scale, as doc-extract reports it, and the same
  scale the 40 percent floor is written on. Phase 7's contract comment said 0 to 1 and three screens
  divided by it.
- **A dependency that is down never reaches the failure handler.** `failure-policy.ts` catches
  `DependencyUnavailableError` and pauses the queue with the job's attempts untouched. Failure cases
  come from permanent failures. Phase 8's spec said "stop doc-extract to see failure cases" and that
  is not what happens; `04-phases.md` is corrected and this is worth knowing before your load test
  reads a pause as a hang.
- **A Next dev server started before a route existed can serve a 404 for it forever.** It cost half
  an hour. If a new page 404s and its api route does not, restart the dev server before looking for
  the bug.
- Everything in `phase-08-handover.md` section 10 is still true: "paused" not "rate limited", a CSS
  animation restarts on mount, the Browser pane freezes animation while hidden, `status` on a run is
  the ingest's and `processingDone` is the pipeline's, and `next typegen` after moving a route.

## 8. Open, and deliberately not built

- **The chat's proposed action card.** It describes phase 8's write path exactly and nothing routes
  a chat turn into a `review_action`. `POST /review/:id/actions` is now a real route with a real
  body, so the missing piece is only the rule for what a turn may write and who may apply it.
  Specify it in `03-infra-deep.md` before phase 10 builds the chat.
- **The action bar on an email that was never escalated.** `EmailCheck.dc.html` draws it live on a
  MISMATCH. Every write path is addressed by a case id and `review_cases` exist only for
  escalations, so there is nothing to write to. Same gap, same answer: it needs a contract first.
  The bar is present and disabled there, with one sentence saying why.
- **Rendered page images** for an unreadable case. `/files/*key` now exists and `docExtract.render`
  already writes the PNGs, so it is an `<img>` and a key away. Still `[~]` in `04-phases.md`.
- **`GET /review/stats` is drawn nowhere.** See section 5.
- **Phase 6's holdout and the full 520 run** are still the user's, and so are phase 5's and phase
  4's open items. `PROGRESS.md` lists them.

## 9. Running it

```bash
docker compose -f compose.local.yaml up -d   # inside backend/
pnpm db:migrate && pnpm dev                  # api on :8091
pnpm dev:worker                              # in another shell
pnpm dev                                     # inside frontend/, :3000
```

`pnpm test` in `backend/` (491) and in `frontend/` (40). `pnpm lint` in `frontend/` enforces the
200 line rule; tests are exempt.

To see phase 8 working, start a run of the edge cases and open `/runs/{id}/review`:

```bash
curl -s -X POST http://127.0.0.1:8091/runs \
  -H "authorization: Bearer $TEAM_API_KEY" -H 'content-type: application/json' \
  -d '{"ratePerSecond":0,"emailIds":["email_501","email_506","email_511","email_513","email_516","email_520"]}'
```

`email_516` is the one to correct: its SI gross weight is `N/A`, and typing the BL's value on the
row re-runs the comparison and closes the case.

For a load test, remember that a run at `ratePerSecond: 0` bursts every email into `classify` at
once. That is the shape phase 9 is measuring, and it is also the shape that starves `compare`
through the semaphore in section 1.
