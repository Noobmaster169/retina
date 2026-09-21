# Phase 5 handover: what phase 4 changed under you

Written 2026-09-20 and brought up to date at the end of phase 4 on
`phase-04-classification-quality` (PR #3, 27 commits ahead of `main`). Read this before
`phase-05-parsing-and-triage.md`: that spec was written before phase 4 and several of its work
items now land on code that has moved. Where the two disagree, this file describes what is built;
the spec's "Amended" section still governs what is not.

The detail behind each point is in `docs/PROGRESS.md` (Phase 4, Phase 4 code review, Design
decisions, Found while building) and `docs/03-infra-deep.md` sections 5.2, 7 and 10.

## 0. Before you start

- **PR #3 is not merged.** The spec's prerequisite is "Phase 4 merged". Branch phase 5 from
  `main` once #3 is in, not from the phase 4 branch.
- **Where phase 4 stands.** The user's full run `69ee1e42` (520 emails, 8 in parallel, 7 min
  46 s, 595 calls, none failed) closed the holdout target (stage 1 0.9938 holdout, 0.9987 full,
  one miss: `email_504`), the full confusion matrix, and the verifier share (14.4%). Still open,
  and the user's to run: the few-shot `v4` holdout run and the model comparison. Leave them in
  PROGRESS as they are.
- **The final score is 0.2996, which is about all classification can earn.** The other 65
  emails the results page marks wrong have the right category and fail a document check, because
  compare is still a placeholder that answers `OK`. That is what phases 5 and 6 are for; the
  results page (section 7) is how you will see each one turn green.
- **The box is not switched yet.** Someone with SSH must put `CLAUDE_CODE_OAUTH_TOKEN` in
  `~/retina/.env` and retire the old host proxy on `172.17.0.1:4001` (`deploy/README.md`,
  "The proxy's login"). Until then nothing on the box can call a model.
- **Locally**, everything runs: `backend/.env` has the token, the `llm-proxy` container serves on
  4001, and the user's `pnpm dev` and `pnpm dev:worker` run in watch mode (they reload on code and
  `.env` changes; do not start a second worker on the same queues).

## 1. Working agreements with the user

- **Keep your own runs to 20 or 30 emails.** The dev sample is one click (`subset: "dev"`, 30
  train emails, six per category), or "First N emails" for 5 to 100. Anything larger (holdout 104,
  all 520) is the user's to start: give them the runs-page steps, do not run it yourself.
- **Parallelism is one env number, now 8.** `CLASSIFY_CONCURRENCY=8` emails at once, and
  `LLM_MAX_CONCURRENCY` (unset, it follows `CLASSIFY_CONCURRENCY`) caps model calls in flight
  across the whole worker, compare queue included. The proxy's `claudecli` `max_concurrency` is 8
  to match. Keep the three in step; the runs page shows the backend's two.
- **Everything a model does must be visible, and it is.** Every call is a `core.llm_calls` row
  with the exact system prompt, input and answer; every call made for an email streams to the run
  page while it runs (section 7). New steps get both by going through `callStructured` with
  `deps.live` set. Do not bypass it.
- **Choices are dropdowns.** The user asked for selectors, not text boxes: a new run option on
  the form is a `LabelledSelect` fed from the backend (as prompt versions come from `/prompts` and
  models from `/ai/models`), never free text.
- One PR per phase, 10 to 20 commits, stage files by path (a second review session sometimes
  edits the same checkout; see memory `concurrent-review-session`).

## 2. The migration is 005, and it is additive

`004_prompt_versions.sql` exists. The spec's `004_documents_reviews.sql` becomes
**`005_documents_reviews.sql`**. Rollback restores the previous image and never touches
Postgres, so it must stay readable by phase 4 code: add tables and columns, no renames, no
`NOT NULL` without a default. Seed the new prompt steps' active rows in the same migration
(section 3).

## 3. New LLM steps: triage and doc-type

Phase 5 adds two model steps (`prompts/triage/v1.md`, `prompts/doc-type/v1.md`). Phase 4 built
the machinery; wire them into it in all of these places or they will half-work:

1. **`PromptStep`** in `backend/src/contracts.ts` gains `"triage"` and `"doc-type"`, and
   **`PromptSet`** (an object, deliberately, so rollback drops unknown steps) gains the two keys.
   Mirror both in `frontend/lib/api/runs-schemas.ts`.
2. **`envModel` in `agents/prompts/prompt-set.ts` is a trap**: it is
   `step === "classify" ? LLM_MODEL_CLASSIFY : LLM_MODEL_VERIFY`, so a new step would silently get
   the verifier's override. Turn it into a map and add `LLM_MODEL_TRIAGE`, `LLM_MODEL_DOC_TYPE` to
   `config.ts` and `.env.example`. `run-plan.ts` alias-checks the env overrides: add the new ones.
3. **Active rows**: seed `('triage','v1',true)` and `('doc-type','v1',true)` in migration 005.
   `pinPromptSet` pins every `PromptStep` at run creation and refuses a version that is not on
   disk, so a missing prompt file fails `POST /runs` with a 400, not a job later.
4. **Loading**: `promptFor(step, set)` refuses an unpinned step. A run created before phase 5
   has no `triage` pin: pass the set through `completePromptSet(set, activeVersions)` first, as
   `classify.processor.ts` does (`promptSetOf`). Never fall back to the newest file.
5. **`registry.test.ts`** checks shipped prompts define the organisers' words and name nothing
   from the inbox. Add the new prompts to its `shipped` list.
6. **The run page**: `frontend/app/runs/[id]/step-label.ts` names steps for the trace, the
   Working now panel and the call cards; add "Triage" and "Document type". The new-run form's
   prompt dropdowns come from `GET /prompts`, which lists every `PromptStep`, so the form needs a
   `LabelledSelect` per new step (`new-run-form.tsx`), pinned only when it differs from the active
   version.
7. **Streaming comes free**: pass `live` in the compare processor's deps (as `ClassifyDeps` has
   it, and `WorkerDeps.live` already carries it) and every triage and doc-type call streams to the
   page. `emailRuns.inFlight` already counts the `comparing` stage as working.

Classify prompts on disk are `v3` (active) and `v4` (few-shot, not validated); `v1` and `v2`
were deleted at the user's request (git has them).

## 4. The compare worker needs the LLM outage policy

`queues/workers.ts` wraps only the classify worker in `pausingOnLlmOutage`. The compare worker is
`noRetryOnTerminal(() => processCompare(...))`: once compare calls a model, a proxy outage there
would burn all three attempts and fail the email for good. Wrap it the same way, and give
`WorkerDeps.compare` the `QueuePauser` type (`rateLimit`) that `classify` has.

Error policy the compare processor inherits, unchanged:

- Retry is the dependency's verdict (`isTransient(UpstreamError)`), never a status list. Every
  proxy error now carries its verdict, streamed or not.
- `LlmUnavailableError`: outage, queue pauses, attempt not spent.
- `LlmTimeoutError`: one try of 600 s, then the queue spends an attempt. A call that always hangs
  ends as a failed email.
- `TerminalError`: fail now. A missing Claude login is one (`provider_not_logged_in`).
- A step whose output never fits its schema twice is a `TerminalError`. Decide per step whether
  that should fail the email or degrade, as the classify processor does for the verifier
  (`verifierError`, generator's category kept).
- Idempotency: a job can run twice. `llmCalls.latestAccepted(emailRunId, step, promptVersion)`
  returns an answer already paid for; reuse it on a retry, as `generate()` does.

`DocExtractClient` should copy this shape: interface, real client, `__fakes__/memory.client.ts`,
`UpstreamError` with a verdict for 5xx, a timeout as its own retryable error.

## 5. The run summary must count `review` as finished

`routes/run-summary.ts` computes `finishedEmails = done + failed`, and `processingDone` and
`elapsedMs` from it. Phase 5's `escalate()` moves an email to `review` and stops there, so a run
with any escalation would never read as finished: the run page would poll forever and the clock
would never stop. Add `review` to `finishedEmails` when escalation lands, and extend both tables
in `test/routes/run-summary.test.ts`.

## 6. Compose: copy the llm-proxy pattern for doc-extract

The proxy became a compose service this phase; doc-extract should look the same:

- `deploy/compose.yaml`: `build: ../projects/retina/services/doc-extract`, no published port,
  reached as `http://doc-extract:8000`. The worker already `depends_on` llm-proxy; add doc-extract.
- `backend/compose.local.yaml`: the worker runs on the host in dev, so publish it on loopback
  (8000 is free on the host; 8080 is the inbox) and set `DOC_EXTRACT_URL` in `.env.example`.
- `deploy/auto-deploy.sh`: rebuild it when `services/doc-extract/` changes, next to the inbox and
  llm-proxy blocks. A failed build keeps the old container.
- `deploy/sim`: removed on 2026-09-21, so this no longer applies and `deploy/` has no local gate.
- CI (`.github/workflows/deploy.yml`) builds the proxy image; add the doc-extract image likewise.

## 7. What the run page does now, and where phase 5 plugs in

- **`/runs`**: the new-run form (dropdowns for emails, pace, each prompt version, model), and per
  run its progress, how long it took, and the score after a submit.
- **`/runs/[id]`**: progress and time per email, calls, verifier share, cost; **Working now**,
  every email a model is answering this second with the JSON it has written so far (polls
  `GET /runs/:id/live` each second); the finished-calls feed; the email list; and per email the
  **trace** (`GET /runs/:id/emails/:emailId/trace`): the verdict (each reader's category,
  confidence, reasoning, counter-cases), the call running now, and every call with its input and
  structured output open. Phase 5 should add the email's documents (type, format, unreadable,
  the review case) to `EmailTrace` in `contracts.trace.ts` and a panel beside the verdict.
- **`/runs/[id]/results`**: the organisers' scoreboard from the last submission, and on a machine
  with the answer key, every email's answer beside the truth for category, status, review
  reason, defect and defect fields (`eval/compare.ts`, `EmailVerdict`). This is where phase 5's
  exit checklist is visible: the 15 escalation emails' review-reason cells should turn from red
  to right, and nothing else should.
- Patterns: schemas live in transport-free files (`lib/api/runs-schemas.ts`,
  `trace-schemas.ts`, `scoring-schemas.ts`) so client components can parse what they poll.
  Browser reads go through `app/api/**` using `passThrough()` (a run's reads) or `gatedRead()`
  from `lib/api-route.ts`; a backend 401 is reported as a key mismatch, not an outage. The email
  list's filters mirror `RunEmailsQuery`; its route's zod `Query` must gain `outcome` alongside
  the backend.

## 8. Contract and file-size notes

- `contracts.ts` is at 177 lines. Put the document and review shapes in a new
  `contracts.review.ts`, re-exported from `contracts.ts`. `Stage` and `DecidedBy` live in the
  leaf `contracts.enums.ts` so sibling contract files can use them without a cycle; put any enum
  two files need there.
- `llm-calls.repo.ts` and `email-runs.repo.ts` delegate their read side to `*.trace.ts` files
  re-exported from the repo; the same split works for a documents repository if it grows.
- `llm.ts` is split: `llm-wire.ts` (client, request, error mapping), `llm-stream.ts`
  (`chatStream`). The doc-extract client is a separate adapter, not part of these.
- `RecordingLlmClient` (`agents/__fakes__/`) records real answers to `test/fixtures/llm/` and
  replays them. Use it for a compare-processor integration test that needs real doc-type answers.
  `MemoryLiveCalls` (`live/__fakes__/`) records every preview write for tests.

## 9. The proxy, as it is now

- A container of the stack, `http://llm-proxy:4000` (host 4001 locally), logged in by
  `CLAUDE_CODE_OAUTH_TOKEN`. There is no remote gateway; `LLM_PROXY_URL` naming `/ai/chat` refuses
  to boot. `claudecli` serves 8 calls at once.
- Aliases: `sonnet`, `opus`, `haiku`, `test`. No Ollama, no Qwen.
- **No built-in tools by default** (`tools: []` in `proxy.yaml`). Triage and doc-type need none.
  A commented `claudecli_web` provider and `sonnet-web` alias are the template if a step ever needs
  web search.
- **Everything streams, schema calls included.** A schema-bound answer streams as the JSON being
  written, a preview; the validated `structured_output` and `usage.cost_usd` arrive on the final
  `message_delta`, and each attempt at the answer is its own content block. The backend streams
  every call made for an email and keeps the text so far in Redis (`live:call:<email run>`).
- Two things streaming showed about the model: it does not keep the schema's property order, so
  "rationale first" is a request, not a guarantee; and sonnet sometimes writes a malformed first
  attempt that the CLI rejects before a valid one. Neither affects the stored answer.

## 10. Gotchas that cost time in phase 4

- vitest 5 calls a function returned from `beforeEach` as cleanup; `beforeEach(() => m.mockReset())`
  calls the mock. Use a braced body.
- On Windows the proxy's fake-`claude` tests fail (shebang scripts). Run the proxy suite on Linux:
  `docker run --rm -v "$(cygpath -m "$PWD")":/src:ro python:3.12-slim sh -c "cp -r /src /w && cd /w && pip install -q -e '.[dev]' && python -m pytest -q"`.
  Doc-extract's pytest suite will want the same.
- Git Bash eats backslashes and apostrophes in inline `sed`, `node -e` and heredocs. Write a script
  file with the Write tool and run it (memory `windows-shell-quoting`).
- `.sh` files are CRLF in this Windows working tree despite `.gitattributes`; do not `COPY` one
  into an image built locally and run it. The proxy Dockerfile runs uvicorn directly for this reason.
- A `claude -p` failure is reported inside its JSON (`result`, and a synthetic assistant message
  with `error`), not on stderr. Read those before deciding retryability.
- `frontend/.env.local` and `backend/.env` must hold the same `API_SHARED_SECRET`. They had
  drifted this phase, and the page said "Could not reach the backend" until the 401 was reported
  as what it is.
- Zod 4's `z.record(enum, ...)` is exhaustive and `z.partialRecord` rejects unknown keys; for a
  shape read back from the database after a rollback, use `z.object` with optional keys, which
  drops what it does not know.

## 11. Open from phase 4, not yours to close

The few-shot `v4` holdout run and the model comparison (the user's to run); the box switch-over;
the image-passthrough check on the box; the verifier threshold (on the full run it ran on 14.4%;
whether it ever changed an answer is in each email's verdict). Leave them in PROGRESS as they are.
