# Phase 9 handover: what phase 8 built, and the two findings that are yours

Written 2026-09-20, after phase 8's exit checklist went green. Read this, then
`docs/04-phases.md` phase 9, then `docs/phases/phase-08-handover.md`, whose shell contract, design
decisions and trap list all still apply unchanged.

---

## 1. The finding phase 7 wrote down and phase 8 did not fix

It is still true and it is still yours. BullMQ runs `CLASSIFY_CONCURRENCY` (8) plus
`COMPARE_CONCURRENCY` (4) jobs at once, and all twelve contend for the eight model slots
`llmSlots(LLM_MAX_CONCURRENCY)` hands out, because `LLM_MAX_CONCURRENCY` defaults to
`CLASSIFY_CONCURRENCY` alone rather than the sum. Eight classify jobs can hold every slot while four
compare jobs sit blocked in the semaphore, which is exactly what the run page keeps showing:
sorting unaffected, checking paused. Either budget both concurrencies against one number, or make
`LLM_MAX_CONCURRENCY` their sum and raise `proxy.yaml`'s `max_concurrency` with it.

Phase 8 left it alone because a UI phase is the wrong place to change how many calls are in flight.
Phase 9 is the right one, and its exit checklist already asks for the assertion.

## 2. A rerun is a job like any other, and priority has to know that

`review/rerun.ts` adds a rerun at `DEFAULT_PRIORITY`. When phase 9 replaces that constant with the
client tier and the tonnage, the rerun has to take the same priority the email had, or a tier-1
client's correction will queue behind a burst. The email's priority is already on `email_runs`;
`requeue` is three lines and one of them is the priority.

While you are there: the rerun's job id is `${runId}__${emailId}__r{n}` from `email_runs.rerun_count`.
`emailIdOfJob` splits on `__` and takes index 1, so it still answers correctly for a rerun. Anything
phase 9 adds that parses a job id has to stay true for the suffix.

## 3. What `/health` does not say yet

Phase 9 extends `/health` with a worker heartbeat. Two things phase 8 makes worth reporting beside
it, both already stored:

- Open failure cases. `reviewCases.stats(db, null)` returns `failures` across every run. A run with
  failure cases is a run that hit something permanent, and that is health, not review.
- The queue's age. `stats` also returns the median time to resolve over the last week. It is built,
  tested and not drawn anywhere; if phase 9 wants an ops view, that is the number for it.

## 4. Traps phase 8 added to the list

- **`UPDATE ... RETURNING` gives you the new row.** Both places that needed the value that stood
  before read it in a CTE first. Anything phase 9 writes that records a change has the same problem.
- **A human value replaces the whole reading, not just the value.** `withHumanValues` drops the
  model's `source_quote`, placeholder and confidence with it. Leaving the quote told the field judge
  that a corrected weight was quoted from a line reading `N/A`, and the correction came straight back
  as the same escalation. If you add another kind of correction, it inherits this.
- **`pageConfidence` is 0 to 100.** tesseract's own scale, as doc-extract reports it, and the same
  scale the 40 percent floor is written on. Phase 7's contract comment said 0 to 1 and three screens
  divided by it.
- **A dependency that is down never reaches the failure handler.** `failure-policy.ts` catches
  `DependencyUnavailableError` and pauses the queue with the job's attempts untouched. Failure cases
  come from permanent failures, not outages. Phase 8's spec said "stop doc-extract to see failure
  cases" and that is simply not what happens.
- **A Next dev server that was started before a route existed can serve a 404 for it forever.** It
  cost half an hour. If a new page 404s and its api route does not, restart the dev server before
  looking for the bug.

## 5. What is built and inert, waiting on a contract

The chat's proposed action card (`05-design.md` section 7) describes phase 8's write path exactly,
and nothing routes a chat turn into a `review_action`. `POST /review/:id/actions` is now a real
route with a real body, so the missing piece is only the rule for what a turn may write and who may
apply it. Specify it in `03-infra-deep.md` before phase 10 builds the chat, as
`phase-08-handover.md` section 3 asked.
