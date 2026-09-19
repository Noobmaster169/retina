# Phase 2 handover

Written 2026-09-19 for whoever finishes phase 2. Read `docs/PROGRESS.md` and
`docs/phases/phase-02-classify-and-score.md` first; this file says what happened after the
phase was first "built", what is verified, and what is left before the exit checklist is green.

Branch: `phase-02-classify-and-score`, pushed, not merged. Last commit `a6e5543`. `main` is at the
phase 1 merge plus its review fixes.

## 1. Where things stand

Phase 2 was built by one session, then reviewed twice in a second session. The review looked at
two things: scope against `emails/data_v2/README.md`, and concurrency of the LLM classify step.
The submission shape and every enum match the organisers' README and `scoring.py` value for value.
The concurrency and structured-output findings were fixed in three commits at the head of the
branch. The exit checklist is not fully green (section 4).

Tests at the last full run: 160 of 160 backend tests, backend type-check clean. After that run
two small edits were made (the submit route now types its bodies with `SubmitResult` and
`SubmitRefused`, and `.env.example` changed); type-check passed after them but the suite was not
rerun. Run `pnpm test` first. Proxy: the 5 new tests pass; 6 older tests in
`proxy/tests/test_providers.py` fail on this Windows machine with or without these changes (they
use a shebang `claude` stub that Windows cannot execute). Do not treat those 6 as regressions.

## 2. What changed after the first build

### Structured output (the user asked for this explicitly)

Before: the prompt told the model to "answer with a single JSON object" and code fished the JSON
out of prose (`extractJson`). That is a request, not a constraint.

Now the schema is a provider constraint as well as prompt text:

- `backend/src/agents/structured.ts` builds the JSON Schema from the zod schema
  (`toOutputSchema`, drops `$schema`) and sends it as `LlmRequest.outputSchema`. The same schema is
  still printed into the prompt so the model knows what each field means. Zod still validates the
  result, because a provider may ignore the constraint and zod holds rules JSON Schema cannot.
- `backend/src/llm.ts` sends it as `output_config: { format: { type: "json_schema", schema } }`.
- `proxy/src/llm_proxy/providers/claude_cli.py`: `cli_args` adds `--json-schema <schema>` to
  `claude -p`; the answer is taken from the envelope's `structured_output`, not `result`. If a
  schema was sent and the CLI returns no `structured_output`, the provider raises instead of
  passing prose on. Streaming falls back to the blocking path when a schema is present.
- `proxy/src/llm_proxy/wire/openai_out.py`: for Ollama and other OpenAI-compatible servers the
  Anthropic shape is translated to `response_format: { type: "json_schema", json_schema: { name,
  schema, strict } }`.
- Checked live against the real CLI (2.1.276): a request with a schema through the patched proxy
  on port 4001 returned a text block that was only the JSON object. Six real emails ran through the
  whole pipeline: all six classified on the first attempt, about 7 s each, `stopReason: end_turn`.

Structured outputs do not support numeric or string constraints (`minimum`, `maxLength`) in the
API's schema subset. `ClassifyOutput` still has `.min(0).max(1)` and `.max(600)`; the CLI accepted
them in the live test, but treat them as advisory and rely on the zod check.

### No token cap (the user asked for this)

- `max_tokens` is optional in prompt frontmatter (`registry.ts`) and in `LlmRequest`.
- `llm.ts` default is 8000, a ceiling and not a budget (8000 is also the most the proxy passes to
  Ollama; `claude -p` ignores it).
- `classify/v3.md` has no `max_tokens`.
- If an answer still stops at `max_tokens`, `callStructured` throws a `TerminalError` at once
  instead of retrying under the same cap. `LlmResponse` now carries `stopReason`, and the ledger
  row stores it under `response.stopReason`.

### Classify prompt v3

`backend/src/agents/prompts/classify/v3.md` is v2 with the "reason briefly, then answer" ending
replaced. A schema-bound answer has no room for prose before it, so `ClassifyOutput` now lists
`rationale` first, then `category`, then `confidence`, and the prompt says to fill them in order.
**The registry takes the highest version on disk, so v3 is what runs now. Its accuracy has not been
measured.** See 4.1.

### Review fixes (findings from the phase 2 review)

| # | Finding | Status | Where |
|---|---|---|---|
| 1 | A short proxy outage permanently fails emails | Fixed, not verified live | `queues/workers.ts` (`pausingOnLlmOutage`), `lib/errors.ts` (`LlmUnavailableError`), `agents/llm-client.ts` |
| 2 | Two restarts mid-call leave an email in `classifying` forever | Fixed | `EMAIL_LOCK.maxStalledCount = 10`; `isFinalFailure` treats "job stalled more than allowable limit" as final |
| 3 | A rerun of classify pays twice and can drag a finished email backwards | Fixed | `classify.processor.ts` reads `classifications.get` first; `emailRuns.moveStage` guards every move |
| 4 | Cancel not honoured after the model call returns | Fixed | status re-checked after `classifyEmail` |
| 5 | Half-ingested run submits without `force` | Fixed | `submissions.routes.ts` `submit()` |
| 6 | SDK retries hide calls and block slots | Fixed | `llm.ts` `maxRetries: 0` |
| 7 | Double submit, orphan payload | Fixed | in-process `submitting` set; row inserted before scoring, `recordScore` after; `latestForRuns` only counts scored rows |
| 8 | Truncated output looks like bad JSON | Fixed | no cap plus terminal on `max_tokens` |
| 9 | Classify concurrency 4 vs proxy limit 2 | Fixed | `CLASSIFY_CONCURRENCY` default 2, `.env.example` 2 |
| 10 | Unused classification columns | **Not done, needs a decision** | section 4.6 |
| 11 | `SubmitResult` / `SubmitRefused` unused | Fixed (the route now types its bodies with them) | |
| 12 | `EVAL_GROUND_TRUTH_PATH` uncommented in `.env.example` | Fixed (commented out) | route itself still exists, section 4.6 |

How the outage handling works, because it is easy to break: on a `LlmUnavailableError` (429 or 5xx
or unreachable from the proxy client) the classify processor's caller calls
`queue.rateLimit(30_000)` and throws `Worker.RateLimitError()`. BullMQ then returns the job to
waiting without spending an attempt, and no worker takes classify jobs for 30 s. `rateLimit` only
takes effect on a worker that has a `limiter` option, so the classify worker has a
`NEVER_REACHED_LIMITER` of 10000 per second. `WorkerDeps.classify` is now typed as a queue that
has `rateLimit`. The mechanism has not been run against a real Redis.

Submit behaviour now: 409 when the run is not `completed` or holds fewer rows than `totalEmails`
(message says "has not finished ingesting ... N of M emails"), 409 when it holds unfinished emails
(as before), 409 when a submission for the run is already being scored. `?force=true` overrides
the first two. A scorer failure leaves an unscored `core.submissions` row (null `scoreboard`,
null `final_score`) pointing at the stored payload; the frontend types already allow that.

## 3. What is verified and what is not

Verified:
- Backend suite and type-check as above. New tests: `test/queues/processors.rerun.test.ts` (rerun
  does not move a done email back, resume after a crash between storing the category and moving the
  stage, cancel during the model call), submit tests (unfinished ingest, concurrent submit, unscored
  row after scorer refusal), `structured.test.ts` (schema sent as constraint, truncation is terminal),
  `registry.test.ts` (optional cap, shipped classify prompt has none), five proxy tests.
- Live: structured output through the patched proxy and real `claude -p`; six emails through the
  whole pipeline (ingest, classify, done).

Not verified:
- The outage pause. The live test (stop the proxy mid-run) was started and the user interrupted it.
- v3 accuracy on the holdout.
- The frontend against the new 409 messages and against an unscored submission row.
- The 520-email run (still open from the original build, section 4.3).
- No unit test covers `pausingOnLlmOutage` or the stalled-out branch of `isFinalFailure`; both are
  private to `workers.ts`.

## 4. What is left, in order

### 4.1 Measure v3 against v2, then keep one

The recorded holdout result is for **v2**: macro-F1 0.9938, 103 of 104, the one miss is
`email_504` (a `wrong_doc_type` case read as SI_REQUEST at 0.70). v3 changes the field order and
the ending of the prompt, so it needs its own number.

1. Start the stack (section 5), then create a run over the holdout ids
   (`eval/split.json`, 104 ids) and let it finish: about 104 calls at 2 in parallel, roughly 6 to
   8 minutes.
2. `pnpm eval:score --run <id> --holdout` from `backend/`.
3. If v3 is at or above v2, keep it and record both numbers in `PROGRESS.md`. If it is lower,
   delete `v3.md` (the registry then picks v2) but keep `max_tokens` optional and the structured
   output work, which do not depend on the prompt version. Put the number in the commit message
   (CLAUDE.md: a pipeline change is not done until the holdout number is in the commit).
4. Reading the holdout again counts as a third read. `PROGRESS.md` already says it was read twice
   and why; add this read to that paragraph plainly.

### 4.2 Run the outage test live

With the api, the worker and the patched proxy running (section 5): create a run of about 8
emails, and about 10 seconds in stop the proxy process on port 4001. Expect in the worker log
`model unavailable, pausing the classify queue`, no `failed for good`, no email in `failed`, and
the run finishing after the proxy is started again. If the jobs fail instead of pausing, the
likely cause is that BullMQ 6.3.6 needs the rate limit set through the worker
(`worker.rateLimit`) and not the queue; the classify `Worker` instance is created inside
`startWorkers`, so pass it out or move the pause into a small module. Add a unit test for
whichever shape works (extract `pausingOnLlmOutage` and the stalled-out check into
`queues/llm-outage.ts` so they can be tested without Redis).

### 4.3 The two open exit items from the original build

- A clean run of all 520 emails. The earlier attempt classified 429 correctly and then failed 91
  in four seconds with "classify/v3.md has bad frontmatter". PROGRESS attributes it to a second
  session editing the checkout while the worker ran, because the worker reads the newest prompt
  file on every call. That earlier `v3.md` was never committed. The `v3.md` on the branch now was
  written in the review session (no `max_tokens`, which the registry now allows), so the same
  failure cannot come from that file, but nothing has run a full 520 with it. Do not edit
  `src/agents/prompts/` while a run is in flight, and do not run two sessions in one checkout.
- Submit all 520 ids from one complete run, and check that the UI `final_score` equals
  `pnpm eval:score` on the full set. Both need the clean run above.

### 4.4 Redeploy the proxy wherever the worker will call it

The container `llm-proxy-llm-proxy-1` on port 4000 is the **old** proxy image and does not know
`--json-schema`. The backend `.env` currently points at `http://127.0.0.1:4001`, where a patched
proxy was started by hand from `proxy/`. The backend does not check the proxy version, but the
proxy now refuses (502) a schema request when the CLI returns no `structured_output`, so a stale
proxy or a Claude Code older than the `--json-schema` flag fails loudly, not quietly. Rebuild the
proxy image before phase 3 deploys it to the Monash box, and record the minimum Claude Code
version (2.1.276 was used) in `proxy/README.md` and `deploy/README.md`.

### 4.5 Documentation that still describes the old behaviour

Update in the same commit as the code, per CLAUDE.md:
- `docs/03-infra-deep.md`: structured output through `output_config.format`; optional
  `max_tokens`; `LlmUnavailableError` and the queue pause; `maxStalledCount`; guarded stage moves
  and the "classify reads a stored category" rule; submit rules (not-yet-ingested 409, one
  submission at a time, row recorded before scoring, unscored rows); `CLASSIFY_CONCURRENCY` 2
  and why (the table at line 104 still says 4).
- `docs/phases/phase-02-classify-and-score.md`: v3, the field order, no cap; the route table.
- `README.md`: the worker section mentions `CLASSIFY_CONCURRENCY=2` already; add the outage
  behaviour and the submit 409 cases.
- `docs/PROGRESS.md`: a "Phase 2 review" block like the phase 1 one, with each finding above and
  how it was checked; move anything not verified into Deferred; correct the test count.
- `proxy/README.md`: structured output support and the CLI version.

### 4.6 Scope decisions that need the user

These were flagged in the review and deliberately not changed, because they touch a forward-only
migration or a rule in CLAUDE.md:
- `core.classifications` has `ver_category`, `ver_confidence`, `human_category`, and `decided_by`
  values `verifier` and `human`. Nothing writes them; the phase 2 spec puts the verifier out of
  scope. `buildSubmission` reads `human_category`. Migration 003 is not on `main`, so it can still
  be edited, but the local dev and test databases already applied it. Dropping them means either
  a new migration 004 or resetting the local databases. The data rules say never drop or overwrite
  without the user's approval, so ask first. The alternative is to leave them for phases 4 and 8
  and say so in `PROGRESS.md`.
- `GET /eval/runs/:id` lets the api process read the answer key when `EVAL_GROUND_TRUTH_PATH` is
  set. CLAUDE.md says only `eval/` may read `ground_truth.json` and it must not be mounted into the
  api. The env line is now commented out in the example, which keeps it off by default, but the
  frontend score column may depend on the route. Decide whether to keep it as dev-only or move it
  behind `pnpm eval:score` only.
- `backend/src/ontology/submission.ts` holds SQL, which CLAUDE.md allows only in repositories.
  Move `buildSubmission`'s query into a repository function (for example
  `emailRuns.listForSubmission`) and keep the pure part in `submission.ts`.

### 4.7 Frontend check

Open `/runs` with the stack running. Submit a run that is still ingesting and confirm the new 409
text shows in the score cell (`frontend/app/runs/score-cell.tsx`); stop the scorer or unset the
inbox key so scoring fails and confirm the row shows as unscored and the earlier score still
shows as the run's `lastSubmission`. Run `pnpm type-check` and `pnpm lint` in `frontend/`.

### 4.8 Close the phase

1. Every item in the exit checklist of `docs/phases/phase-02-classify-and-score.md` ticked with
   how it was checked.
2. `PROGRESS.md` scores table has the phase 2 holdout row.
3. Open the pull request (`gh` is not installed on this machine; the phase 1 PR was created
   through the GitHub API with the token from `git credential fill`, never printed), merge to
   `main`, and confirm `main` still builds. `main` auto-deploys to the VPS every 3 minutes; the
   VPS runs only the api, so migration 003 and the new routes go live there, and
   `POST /runs/:id/submit` answers 503 there until phase 3 (no MinIO).

## 5. Running it locally

Docker Desktop must be running. From `backend/`:

```
docker compose -f compose.local.yaml up -d      # postgres 5433, redis 6379, minio 9000, inbox 8080
pnpm db:migrate
pnpm dev                                        # api on 8091
pnpm dev:worker                                 # workers
```

The proxy: `backend/.env` sets `LLM_PROXY_URL=http://127.0.0.1:4001`. Start a patched proxy from
`proxy/` with `LLM_PROXY_PORT=4001 PYTHON=.venv/Scripts/python ./start.sh`. The `.venv` there has
the dev dependencies installed (`pip install -e ".[dev]"`); `pytest` is `.venv/Scripts/python -m
pytest`. `claude` must be logged in on this machine.

The database name and user are in `backend/.env` (`PG_DATABASE`, `PG_USER`); to inspect the
ledger: `docker exec backend-postgres-1 psql -U <user> -d <db> -c "select ... from core.llm_calls"`.
The bearer key for the api is `TEAM_API_KEY` in `.env`.

## 6. Things to know before touching anything

- **At the moment this was written**, a dev api (8091), a dev worker and a patched proxy (4001)
  started from the previous session may still be running, and Docker Desktop and the local compose
  stack are up. Check before starting your own (`curl localhost:8091/health`) and stop stale ones.
- The local dev database contains test runs from live checks (a 6-email run and earlier phase 1
  smoke runs). They are harmless; do not delete them without asking.
- The four `proxy/src/retina_proxy.egg-info/*` files show as modified. They are build output and
  were left out of every commit on purpose. Do not commit them.
- Windows: Git Bash eats backslashes in inline `sed` and `python -c`; use the Edit tool or a script
  file (see the memory note on shell quoting). Git prints LF-to-CRLF warnings on every add; they
  are noise.
- The backend reads the newest prompt file on every LLM call. A half-written prompt file fails the
  emails that hit it. Edit prompts only while no run is in flight.
- Cost: the numbers the ledger records are counterfactual API prices; the `claudecli` provider is
  the subscription and no money leaves the account. A full 520 run at 2 in parallel is about 25 to
  30 minutes.
- Do not add rules keyed on email ids, sender domains or subject codes (CLAUDE.md, and
  `registry.test.ts` fails if the shipped prompt names any from the inbox).

## 7. Decisions taken in the review session, and why

- The schema goes both to the provider and into the prompt. The provider constraint gives
  deterministic shape; the prompt copy tells the model what the fields mean. Zod stays as the last
  check because the constraint can be ignored by a provider and cannot express every rule.
- No cap on tokens by default, terminal on a `max_tokens` stop. A cap that bites truncates the
  answer; a retry under the same cap fails the same way, so it should not be retried.
- `maxRetries: 0` in the SDK. Retries belong to BullMQ for the pipeline; a hidden second call
  doubled a hung call to 20 minutes and made the ledger understate calls and cost.
- Classify concurrency 2, not 4, to match the proxy's `max_concurrency` for `claudecli`. More
  workers only queue inside the proxy with their request timeout already running.
- A model outage pauses the classify queue rather than failing emails. The alternative, longer
  backoff on the job, still burns attempts and still fails a long outage.
- Guarded stage moves instead of a lock: every move names the stages it may start from, so a
  second pass over a finished email changes nothing, with no extra table or Redis lock.
