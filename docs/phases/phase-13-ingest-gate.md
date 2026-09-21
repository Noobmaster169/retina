# Phase 13: the ingest gate

**The design is `docs/phases/phase-13-ingest-gate-design.md`.** Read it first; this
file is the work list and the order to do it in. Where the two disagree, the spec is the intent and
this file is the plan.

**Goal.** An email cannot cost us a model call until a deterministic function has said it may. The
function reads counts, sizes and timestamps, never the words in an email, and its verdict is
`admit` or `hold` and never a category.

**The rule the whole phase hangs on.** An automatic rule may only hold. Only a person may block.
`From` is forgeable, so a machine that could blacklist could be made to blacklist a customer.

## Build, in order

1. **Migration `025_ingest_gate.sql`.** `core.gate_policy`, `core.gate_activity`,
   `core.gate_decisions`. No existing table is touched.
2. **`contracts.gate.ts`.** `GateMode`, `GateStanding`, `GateDecision`, `GateReason`, `GatePolicy`,
   `GateVerdict`, `GateSenderRow`, `GateHeldRow`, `GateOverview`, `GatePolicyUpdate`. Re-export from
   `contracts.ts`. `RunSummary` gains `heldByGate`.
3. **`pipeline/gate/cost.ts`.** `costOf(record) -> { units, breakdown }`. Pure.
4. **`pipeline/gate/standing.ts`.** `standingOf({ policy, daysSeen, ageDays }) -> { standing, burst,
   daily }`. Pure, first match wins.
5. **`pipeline/gate/growth.ts`.** `clampDaily(standing, standingDaily, last14) -> number`. Pure.
6. **`pipeline/gate/decide.ts`.** The multi-parameter function: standing, three bucket readings,
   budget level, mode, meter availability, in; a `GateVerdict` out. Pure.
7. Table-driven tests for 3 to 6 before wiring any of it. Every bracket boundary, every scope
   refusing, the clamp floor, the three budget levels, the Redis-down fallback per standing.
8. **`ingest/gate/meter.ts`.** `GateMeter`: three token buckets and three daily counters in one Lua
   script, one round trip, atomic. `__fakes__/memory.meter.ts` beside it.
9. **`gate-senders.repo.ts`** and **`gate-decisions.repo.ts`**. All the SQL, one query that answers
   policy and activity for both scopes at once.
10. **`ingest/gate/gate.ts`.** Load, decide, record. Thin.
11. **Wire into `ingest-email.ts`**: the gate runs after `source.getEmail` and before
    `storeAttachments`. A hold writes `core.emails` and a decision row and stops. `replayRun` counts
    a held email as placed so the loop moves on.
12. **Release.** `JOB_NAMES.release` on the ingest queue, `ReleaseJob`, `RunQueues.releaseEmail`,
    the worker branch, and the bypass argument on `ingestEmail`.
13. **`refresh-gate-budget`** scheduler task, every five minutes, summing today's `cost_usd` from
    `core.llm_calls` into Redis.
14. **`routes/gate.routes.ts`** and the mount in `app.ts`.
15. **`run-summary.ts`**: `heldByGate` in, and counted by `processingDone`.
16. **Frontend.** `lib/api/gate-schemas.ts`, `gate-client.ts`, the barrel, the four route handlers
    under `app/api/gate/`, the `/traffic` page with its two panes, and the rail destination.
17. **Docs.** `03-infra-deep.md` gains the tables, the routes and `heldByGate`. `README.md` gains
    the five env vars. `PROGRESS.md`.

## Traps

- **Do not give a held email an `email_runs` row.** `Stage` is a closed enum on both sides and a
  rollback would meet a value it refuses. That is why `heldByGate` exists.
- **Charge the buckets even on a hold**, in every mode. Otherwise an attacker sitting exactly at
  the limit retries for free, and `observe` would show numbers `enforce` never sees.
- **A person's policy bites in `observe` too.** An automatic verdict does not. That difference is
  the phase.
- **`GATE_MODE` defaults to `observe`.** A live gate on the Averis replay would hold most of the
  demo: 520 emails from fifteen domains, all `unknown` on their first day.
- The gate never imports an agent, a prompt or an LLM client. If it needs one, the design is wrong.

## Exit checklist

- [x] `pnpm type-check` and `pnpm test` green in `backend/` (1146 tests); `pnpm type-check`,
      `eslint` and `vitest` green in `frontend/`.
- [x] A held email leaves `core.llm_calls` untouched and writes no object, proven by a test
      (`test/ingest/gate.test.ts`).
- [x] Four pure modules, each with a table-driven test covering its boundaries (82 tests).
- [x] `GATE_MODE=observe` records a verdict for every email and holds nothing an automatic rule
      decided. Seen live: 30 decisions over the day's real traffic, 21 of them holds that would
      have bitten, none enforced.
- [x] `GATE_MODE=enforce` over a burst from one unknown domain admits the first email and holds
      the rest: `pnpm gate:drill --emails 10` gave 1 admitted, 9 held, blamed on the address
      burst. Covered by test as well.
- [x] Blacklisting a domain holds its next email in `observe`, and `auto` admits again. Covered
      by `test/ingest/gate.test.ts` and by the route tests.
- [x] Releasing a held email carries it into the pipeline with its attachments, and a second
      release is refused.
- [x] `03-infra-deep.md` carries the three tables, the six routes, `RunSummary.heldByGate` and the
      five env vars. `README.md` has the routes and the two tasks.
- [ ] `PROGRESS.md` updated and the phase merged to `main`.

**Left for the user, because both spend real tokens on a shared box.** Neither blocks the phase:
each is covered by a test, and what is missing is only the live confirmation.

- A replay under `GATE_MODE=enforce`, to watch a real run produce releasable holds and to release
  one through to a verdict on the page. The drill cannot stand in for this: its holds carry no
  run, so they are deliberately kept out of the holding pen.
- A look at the `/gate` page during a burst run, to see the bars fill.
