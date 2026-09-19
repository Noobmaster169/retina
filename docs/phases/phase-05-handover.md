# Phase 5 handover: what phase 4 changed under you

Written 2026-09-20, at the end of phase 4 on `phase-04-classification-quality` (PR #3). Read this
before `phase-05-parsing-and-triage.md`: that spec was written before phase 4 and several of its
work items now land on code that has moved. Where the two disagree, this file describes what is
built; the spec's "Amended" section still governs what is not.

The detail behind each point is in `docs/PROGRESS.md` (Phase 4, Phase 4 code review, Design
decisions) and `docs/03-infra-deep.md` sections 5.2, 7 and 10.

## 0. Before you start

- **PR #3 is not merged.** The spec's prerequisite is "Phase 4 merged". Its holdout
  measurements (stage 1 with the verifier, the few-shot `v4` run, the model comparison, the
  full 520) are the user's to run from the runs page; see PROGRESS "Phase 4". Branch phase 5
  from `main` once #3 is in, not from the phase 4 branch.
- **The box is not switched yet.** Someone with SSH must put `CLAUDE_CODE_OAUTH_TOKEN` in
  `~/retina/.env` and retire the old host proxy on `172.17.0.1:4001` (`deploy/README.md`,
  "The proxy's login"). Until then nothing on the box can call a model.
- **Locally:** `backend/.env` has the token. Bring the stack up with
  `docker compose -f compose.local.yaml up -d --build llm-proxy` (host port 4001). A host-run
  proxy from before may still hold 4001; stop it first.

## 1. Working agreements with the user

- **Keep your own runs to 20 or 30 emails.** The dev sample is one click (`subset: "dev"`, 30
  train emails, six per category). Anything larger (holdout 104, all 520) is the user's to start:
  give them the runs-page steps or the command, do not run it yourself.
- **Parallelism is one env number.** `CLASSIFY_CONCURRENCY` emails at once, and
  `LLM_MAX_CONCURRENCY` (unset, it follows `CLASSIFY_CONCURRENCY`) caps model calls in flight
  across the whole worker, compare queue included. The runs page shows both.
- **Everything a model does must be visible.** Every call is a `core.llm_calls` row with the
  exact system prompt, input and answer, and `/runs/[id]` shows it per email. New steps get this
  for free by going through `callStructured`; do not bypass it.
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
6. **`call-card.tsx`** has `STEP_LABEL` for the trace view; add labels for the new steps.

## 4. The compare worker needs the LLM outage policy

`queues/workers.ts` wraps only the classify worker in `pausingOnLlmOutage`. The compare worker is
`noRetryOnTerminal(() => processCompare(...))`: once compare calls a model, a proxy outage there
would burn all three attempts and fail the email for good. Wrap it the same way, and give
`WorkerDeps.compare` the `QueuePauser` type (`rateLimit`) that `classify` has.

Error policy the compare processor inherits, unchanged:

- Retry is the dependency's verdict (`isTransient(UpstreamError)`), never a status list.
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

`routes/run-summary.ts` computes `finishedEmails = done + failed` and `processingDone` from it.
Phase 5's `escalate()` moves an email to `review` and stops there, so a run with any escalation
would never read as finished and the run page would poll forever. Add `review` to
`finishedEmails` when escalation lands, and extend the table in `test/routes/run-summary.test.ts`.

## 6. Compose: copy the llm-proxy pattern for doc-extract

The proxy became a compose service this phase; doc-extract should look the same:

- `deploy/compose.yaml`: `build: ../projects/retina/services/doc-extract`, no published port,
  reached as `http://doc-extract:8000`. The worker already `depends_on` llm-proxy; add doc-extract.
- `backend/compose.local.yaml`: the worker runs on the host in dev, so publish it on loopback
  (8000 is free on the host; 8080 is the inbox) and set `DOC_EXTRACT_URL` in `.env.example`.
- `deploy/auto-deploy.sh`: rebuild it when `services/doc-extract/` changes, next to the inbox and
  llm-proxy blocks. A failed build keeps the old container.
- `deploy/sim`: add checks like the two proxy ones (it answers inside the stack; the api or
  worker reaches it by name). Run `./sim.sh up && ./sim.sh test <branch>`: it was 20 of 20 at the
  end of phase 4 and is the only gate on `deploy/`.
- CI (`.github/workflows/deploy.yml`) builds the proxy image; add the doc-extract image likewise.

## 7. Frontend patterns now in place

- Schemas live in transport-free files (`lib/api/runs-schemas.ts`, `lib/api/trace-schemas.ts`)
  so client components can parse what they poll. New shapes (the `review` counts on
  `RunSummary`, an `outcome` filter) go there, not into `runs-client.ts`.
- Browser polling goes through `app/api/runs/**` pass-through routes using `passThrough()` and
  `badQuery()` from `lib/api-route.ts`, which check site access, the run id and the query.
- `/runs/[id]` polls the run once in `run-detail.tsx` and stops every panel when
  `processingDone` (hence section 5).
- The email list's filters mirror `RunEmailsQuery`; the route's zod `Query` in
  `app/api/runs/[id]/emails/route.ts` must gain `outcome` alongside the backend.

## 8. Contract and file-size notes

- `contracts.ts` is at 179 lines. Put the document and review shapes in a new
  `contracts.review.ts` (as `contracts.trace.ts` was split), re-exported from `contracts.ts`.
- `llm-calls.repo.ts` delegates reads to `llm-calls.trace.ts`; the same split works for a
  documents repository if it grows.
- `RecordingLlmClient` (`agents/__fakes__/`) records real answers to `test/fixtures/llm/` and
  replays them. Use it for a compare-processor integration test that needs real doc-type answers.

## 9. The proxy, as it is now

- A container of the stack, `http://llm-proxy:4000` (host 4001 locally), logged in by
  `CLAUDE_CODE_OAUTH_TOKEN`. There is no remote gateway; `LLM_PROXY_URL` naming `/ai/chat` refuses
  to boot.
- Aliases: `sonnet`, `opus`, `haiku`, `test`. No Ollama, no Qwen.
- **No built-in tools by default** (`tools: []` in `proxy.yaml`). Triage and doc-type need none.
  A commented `claudecli_web` provider and `sonnet-web` alias are the template if a step ever needs
  web search.
- Structured output works through the container (`--json-schema`), verified live. Token streaming
  works (`--include-partial-messages`), but the backend does not stream.

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

## 11. Open from phase 4, not yours to close

The holdout, few-shot, model-comparison and full-inbox runs; the box switch-over; the
image-passthrough check on the box; the verifier threshold (it agreed on all 7 dev-sample cases it
saw, so it may be lowered once the holdout says so). Leave them in PROGRESS as they are.
