# Phase 4 handover: what the phase 3 review changed under you

Written 2026-09-19, at the end of the full-codebase review on `review-fixes-phase-03`.
Read this before `phase-04-classification-quality.md`, because two of that spec's work items
describe behaviour that no longer exists, and one of them would reintroduce a bug that cost a
whole queue.

The review's own record, with how each item was checked, is in `PROGRESS.md` under
"Phase 3 code review". This file is only the part phase 4 has to act on.

## 1. Retry is decided by the proxy's verdict, not by a status code

**This is the one that matters.** Work item 3 of the phase 4 spec used to read:

> Retries 429, 502, 503, 504 and timeouts twice with jitter (1 s, 3 s) inside `complete`, then
> throws `RetryableError`. 400 and schema errors stay `TerminalError`.

That rule is what caused the bug the review found. An unknown provider and a dead upstream are
both HTTP 500 from the proxy. Reading `status >= 500` as transient meant `pausingOnLlmOutage`
(`queues/failure-policy.ts`) put the job back **with its attempts untouched**, so a typo in
`LLM_MODEL_CLASSIFY` requeued every 30 seconds forever: no email ever failed, no attempt was ever
spent, and the only signal was a warn line saying the model was unavailable when the model was
fine.

What exists now:

- The proxy serialises its own per-error-class verdict. `POST /v1/messages` errors carry
  `error.code` (a stable machine name) and `error.retryable` (`proxy/src/llm_proxy/errors.py`).
- `UpstreamError` in `backend/src/lib/errors.ts` carries `status` and `retryable: boolean | null`,
  where `null` means the dependency did not say.
- `isTransient(error)` is the single decision: the dependency's verdict wins, and the status is
  only the fallback when there is none.
- `app.ts` puts `retryable` on its own error body, so the verdict survives the gateway transport
  (`llm-gateway.ts`) when `LLM_PROXY_URL` names another Retina API's `/ai/chat`.

**So when you add retries with jitter inside `complete`, loop on `isTransient(error)`. Do not
write a status list.** A status list silently un-fixes this. `backend/test/agents/llm-client.test.ts`
already pins the six status/verdict combinations; extend that table, do not replace it.

This matters more in phase 4 than it did in phase 3, because phase 4 introduces
`LLM_MODEL_VERIFY` and a model-comparison item that deliberately points the pipeline at aliases
it has never used. A wrong alias is now a fast, visible `TerminalError`. Keep it that way.

## 2. `LlmProxyError`, `EmailServerError` and `ScorerRefused` are gone

They were three copies of one shape, one of them without a status, and `app.ts` had grown an
`instanceof` branch per service. All three are now `UpstreamError` and the middleware is one
branch. Any phase 4 code written against the old names will not compile, which is the intended
outcome. `isRetryable` is also gone: it had no callers and encoded a fourth, contradictory policy
right where a reader would find it first.

## 3. The frontend parses; it does not cast

Every backend response is now parsed against a zod schema under `frontend/lib/api/`. There is no
`as` on a fetch result anywhere in the frontend, and `eslint` enforces the 200-line rule there.

Work item 9 adds `verifierShare` to `GET /runs/:id`'s `llm` object, and adds `category` and
`decidedBy` to the email list. That is a contract change, so it lands in **four** places, not two:

1. `backend/src/contracts.ts` (the zod source of truth)
2. `backend/db/migrations/` check constraints, if it is an enum
3. `frontend/lib/api/runs-client.ts` as a **zod schema**, not an interface
4. `docs/03-infra-deep.md`

`RunSummary` in `runs-client.ts` is a `z.object`, not an `interface`. Add the field to the schema
and the type follows.

## 4. Frontend surface phase 4 will want back

The review deleted exports with no call site, on the phase rule that nothing ships before its
consumer. Phase 4's run page needs some of them back. They are not lost; restore them from
commit `d68ed1b`:

```bash
git show d68ed1b^:frontend/lib/api-client.ts
```

- `getRun(id)` and `listRunEmails(id, query)` plus `RunEmailItem`, `RunEmailsQuery`,
  `RunEmailsPage` for `/runs/[id]`.
- `Category`, `ComparisonStatus`, `ReviewReason`, `ComparisonField` for the category filter.

Bring them back **as zod schemas** in `lib/api/runs-client.ts` (or a new `lib/api/` file if that
one nears 200 lines), not as the interfaces they were.

Backend equivalents deleted the same way: `CompareJob.rerunFrom` (phase 8) and
`keys.text` / `keys.page` / `keys.upload` (phases 5, 6, 9).

## 5. `eval:parity` now gates the publish

`backend/src/eval/score.ts` is a hand port of the organisers' `emails/server/scoring.py`, which
this repo does not control. `pnpm eval:parity` is the only thing proving they still agree, and it
used to run when someone remembered. It is a CI job now
(`.github/workflows/deploy.yml`, job `parity`), and `build-api` needs it.

Phase 4 does not change scoring, but it does change what reaches the scorer. If a stage 1 change
ever moves a number, parity failing in CI means the port drifted, not that your classifier got
worse. Read `eval/parity.ts` before assuming the latter.

The review considered deleting `score.ts` and shelling out to `score_cli.py` for everything, and
rejected it: scoring a subset needs a filtered truth file on disk, and writing copies of
`ground_truth.json` anywhere breaks the repo's hardest data rule. Do not revisit that without a
better idea than a temp file.

## 6. Your migration is expand/contract, and it is not optional

Work item 1 adds `core.prompt_versions`. `auto-deploy.sh` rolls back by restoring the previous
image and the previous `compose.yaml`; it never touches Postgres. So a migration that a health
check failure strands has to stay readable by the code it rolls back to: add, do not rename or
drop, no `NOT NULL` without a default, contract in a later commit.

A rollback over an incompatible migration reports success and serves broken, because the health
gate only asks whether Postgres answers. This is now in `CLAUDE.md` under Data rules and in
`deploy/README.md`.

## 7. Smaller things you will touch

- `llm.ts` and `llm-gateway.ts` no longer import each other. The shapes both transports speak are
  in `backend/src/llm-contract.ts`. `llm.ts` re-exports them, so existing imports still work.
- `config.ts` now has a `superRefine`. It is the place to add a cross-field rule, and the pattern
  to copy if `LLM_MODEL_VERIFY` should be validated against the alias list at boot rather than
  failing on the first call.
- `stageCountsForRuns` and `usageForRuns` return a **total lookup function**, not a `Map`. Call
  `counts(runId)`, not `counts.get(runId)`. Work item 9's aggregate over `llm_calls` and
  `classifications` should follow the same shape: put the default inside the repository so the
  caller has no absent case to invent.
- The proxy cancels a call whose caller disconnected. Phase 4's `withLlmSlot` semaphore sits in
  the worker; the proxy's `max_concurrency: 2` for `claudecli` is the real ceiling, and the two
  numbers are still set independently in two files. See Deferred in `PROGRESS.md`.
- The backend's 600 s LLM timeout is still shorter than the proxy's worst case. It no longer
  strands work, but if phase 4's retries make calls longer, pick one owner for that number.

## 8. How to check you have not broken any of it

```bash
cd backend  && pnpm type-check && pnpm test        # 188 at the time of writing
cd frontend && pnpm type-check && pnpm lint && pnpm build
cd proxy    && uv run ruff check . && uv run pytest -q
cd backend  && pnpm eval:parity                     # 7 cases, four decimals
cd deploy/sim && ./sim.sh test <your-branch>        # only if you touch deploy/
```

`proxy/tests/test_providers.py` has 6 failures on Windows that predate all of this: the
`fake_claude` fixture writes a shebang script Windows cannot exec. They pass on Linux and in CI.
Verified by stashing, not assumed.
