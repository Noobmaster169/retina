# Retina SDOC: Phases

One phase = one Claude Code session. Each phase ends with something that runs end to end and
can be shown. Later phases only add; they never require rewriting an earlier phase's module.
Order matters: the score becomes visible in phase 2, the VPS is live in phase 3, and every phase
after that auto-deploys.

Session start: read `CLAUDE.md`, `PROGRESS.md`, this file's row for the phase, then the detailed
spec in `docs/phases/phase-NN-*.md`, which is the authoritative work list. Session end: exit
checklist green, `PROGRESS.md` updated, merged to `main`.

The sections below are summaries. The detailed specs are:

```
docs/phases/phase-01-skeleton.md
docs/phases/phase-02-classify-and-score.md
docs/phases/phase-03-vps-deploy.md
docs/phases/phase-04-classification-quality.md
docs/phases/phase-05-parsing-and-triage.md
docs/phases/phase-06-extraction-and-comparison.md
docs/phases/phase-07-dashboard-and-trace.md
docs/phases/phase-08-review-inbox.md
docs/phases/phase-09-priority-and-ops.md
docs/phases/phase-10-analytics-and-chat.md
docs/phases/phase-11-eval-and-lessons.md
docs/phases/phase-12-hardening-and-demo.md
```

| # | Phase | Visible result |
|---|---|---|
| 1 | Skeleton: ingest, queues, storage | Emails flow from Averis into Postgres and MinIO through a queue; counts on a page |
| 2 | LLM classification, submission, first score | Every email classified by the LLM, a real score from the Averis scorer, the local eval harness |
| 3 | VPS deploy and Vercel | Same thing running on the box, reachable through the Vercel URL |
| 4 | Classification quality | Prompt versions, verifier on doubt, gated few-shot, model comparison; stage 1 score rises |
| 5 | Document parsing and triage | doc-extract service, attachment triage, fingerprints, first escalations |
| 6 | Extraction and comparison | Seven fields with evidence, deterministic diff, full submission; end-to-end score rises |
| 7 | Dashboard and email trace | Run view with live counters, per-email trace page |
| 8 | Review inbox | Human actions, uploads, failures with retry |
| 9 | Priority, concurrency, ops | Client tiers, aging, semaphore, extended health, heartbeat |
| 10 | Analytics schema and chat agent | Star-schema views, read-only role, chat page, explain a decision |
| 11 | Eval tooling and gated lessons | Prompt versions, run diff, lesson proposals with approval and eval gate |
| 12 | Hardening and demo | Failure drills, fresh-seed test, demo script, docs final |

## Phase 1: Skeleton

**Goal.** An email travels Averis → Postgres → MinIO → queue → worker → stage `done`, with
nothing intelligent in between. This proves the plumbing and creates the shapes every later
phase fills in.

**Build.**

- `compose.local.yaml`: add redis (AOF, noeviction), minio + bucket init, averis (organiser
  server, `127.0.0.1:8080:8000`, data mounted read-only, answer key mounted only there).
- `config.ts` with zod env parsing. `lib/errors.ts` with `RetryableError`, `TerminalError`.
- Migrations: `runs`, `clients`, `emails`, `email_runs`, `attachments`.
- `ingest/source.ts` interface, `averis.source.ts`, `replay.ts` (rate, limit, burst).
- `storage/minio.ts`: put, get, stream, key builders.
- `queues/`: connection, names, `classify` and `compare` queues, worker entrypoint
  `worker.ts`. Classify processor: mark `classified`, enqueue compare. Compare processor:
  mark `done`. Job options from `03-infra-deep.md` section 4.2.
- Repositories: `runs`, `emails`, `email-runs`, `attachments`.
- Routes: `POST /runs`, `GET /runs`, `GET /runs/:id` (stage counts, queue depth),
  `GET /runs/:id/emails`. Extended `/health` (postgres, redis, minio, averis).
- Frontend: password gate middleware, `/runs` page listing runs and stage counts, polling 3 s.
- Tests: repositories against local Postgres; replay controller with a fake `Source`.

**Exit checklist.**

- [ ] `POST /runs {ratePerSecond: 5}` ingests all 520 emails; `email_runs` has 520 rows at `done`.
- [ ] Every attachment exists in MinIO under the run prefix with matching `sha256`.
- [ ] Killing the worker mid-run and restarting it finishes the run with no duplicate rows.
- [ ] `/runs` page shows counts moving while a run is in progress.
- [ ] `pnpm test` and `pnpm type-check` pass.

## Phase 2: LLM classification, submission, first score

**Goal.** A real number from the organisers' scorer with every email classified by the LLM, plus
a local harness that computes the same number on the holdout. Everything after this phase is
measured against it. No hand-written classification rules, here or later: the inbox is one small
seeded sample, and the judges may score another.

**Build.**

- The LLM seam (`agents/llm-client.ts` with a fake), `agents/structured.ts` (schema in the
  prompt, zod parse, one retry), one zero-shot prompt `prompts/classify/v1.md` that defines the
  categories in the organisers' words, and the `llm_calls` ledger.
- `pipeline/classify/input.ts`: sender, subject, attachment names, body capped in length only.
- Classify processor: generator call, persist `classifications` (`decided_by = llm`), send only
  `BL_COMPARISON` on to compare.
- Compare processor: persist `comparisons` with `status = OK`, no diffs (placeholder outcome).
- The organisers' enums in `contracts.ts`, value for value, and as check constraints.
- `ontology/submission.ts`: build the scorer JSON for a run. Every email present, every row
  validated against the enums.
- `POST /runs/:id/submit` → inbox `/submit` → store `submissions`. `GET /runs/:id/submission.json`.
- `eval/split.ts` (stratified 80/20, committed `eval/split.json`), `eval/score.ts` (port of
  `scoring.py`, proven against the organisers' CLI by `pnpm eval:parity`), `eval/run-eval.ts`.
- Migration: `classifications`, `comparisons`, `llm_calls`, `submissions`.
- Frontend: score card and submit button on `/runs`.

**Exit checklist.**

- [ ] `eval/score.ts` and `score_cli.py` agree to four decimals on the same submissions.
- [ ] No rule decides a category, and the prompt names nothing from the dataset.
- [ ] Every enum is exactly the organisers'.
- [ ] Zero-shot stage 1 macro-F1 at or above 0.90 on the holdout, model recorded.
- [ ] A submitted run shows `final_score` on the page.
- [ ] Score and holdout numbers recorded in `PROGRESS.md`.

## Phase 3: VPS deploy and Vercel

**Goal.** The phase 2 system runs on the Monash box and is reachable through the Vercel URL.
Doing this now, while the system is small, means every later phase is a `git push` away from
a demo and infra surprises surface early.

**Build.**

- `deploy/compose.yaml`: postgres, redis, minio, minio-init, inbox, api, worker. The organiser
  kit is committed in `emails/`, answer key included, and mounted into `inbox` only.
- `auto-deploy.sh`: a health gate that does not roll back a degraded MinIO, `api` and `worker`
  recreated together, and the stack's own copies of `compose.yaml` and the script kept in step
  with the clone.
- `deploy/bootstrap-wizard.sh`: the one box step, and the last one.
- `deploy/sim/`: the deploy scripts exercised against a replica of the box, rollback included.
- Vercel project on this repo: `BACKEND_URL`, `API_SHARED_SECRET`, `SITE_PASSWORD`. There is no
  `SESSION_SECRET`: the gate's cookie is an HMAC of `SITE_PASSWORD`.
- Spend attribution on proxy calls is already there: `llm.ts` sends `retina-<project>` as the
  SDK's `apiKey`, which is what the proxy reads as the project name.
- Runbook additions in `deploy/README.md`: new services, logs, what to restart.

**Exit checklist.**

- [ ] `curl https://<domain>/health` green for every dependency.
- [ ] A run started from the Vercel page completes on the box and scores through the box's averis.
- [ ] A push to `main` shows up on the box within 5 minutes without manual steps.
- [ ] `docker compose ps` shows no published ports other than `127.0.0.1:8091` and `127.0.0.1:8080`.

## Phase 4: Classification quality

**Goal.** The zero-shot classifier from phase 2 gets better, and every improvement is measured:
comparable prompt versions, a verifier when the generator is unsure, few-shot only if the holdout
says so, and a model comparison. Still no hand-written rules.

**Build.**

- `prompt_versions` migration, `registry.resolve(step, promptSet)`, `promptSet` on `POST /runs`.
- `prompts/classify-verify/v1.md`; `pipeline/classify/decide.ts`: the verifier runs when the
  generator's own confidence is below a constant chosen on the train split.
- `eval/examples.ts`: few-shot examples from the train split for a new prompt version, shipped
  only if its holdout run beats the zero-shot one. Both numbers recorded either way.
- Model comparison: one holdout run per proxy alias; accuracy, cost and latency recorded.
- `llm-client`: retries with jitter, `withLlmSlot` semaphore for `LLM_MAX_CONCURRENCY`,
  `RecordingLlmClient`.
- Frontend: `/runs/[id]` shows verifier share and LLM cost.

**Exit checklist.**

- [ ] Stage 1 macro-F1 on holdout at or above 0.95, recorded in `PROGRESS.md`.
- [ ] Verifier ran on under 25% of emails.
- [ ] The few-shot experiment and the model comparison are recorded.
- [ ] `llm_calls` has one row per call with tokens and cost.
- [ ] Worker with `FakeLlmClient` passes the classify processor tests without network.

## Phase 5: Document parsing and triage

**Goal.** Every attachment becomes text (or is declared unreadable), the SI and BL are
identified by content, and the three structural escalations exist. No field extraction yet.

**Build.**

- `services/doc-extract/`: FastAPI, `extractors/{txt,pdf,docx,xlsx}.py`, `registry.py`,
  OCR fallback with tesseract (`eng+chi_sim`), `/extract`, `/render`, `/healthz`, Dockerfile,
  pytest with one fixture per format plus the scanned and garbled PDFs.
- `DocExtractClient` interface + fake in the worker.
- `pipeline/compare/triage.ts` (attachment count, roles, comparison-requested detection),
  `fingerprint.ts`, both table-driven tested.
- Compare processor: triage → fingerprint → parse → persist `documents` → outcome
  `NEEDS_REVIEW` with `missing_attachment`, `wrong_doc_type`, or `unreadable`, else still `OK`.
- `pipeline/escalate.ts` + `review_cases` migration.
- Compose (local and VPS): doc-extract service; `auto-deploy.sh` builds and recreates it.
- Frontend: review reason counts on `/runs/[id]`.

**Exit checklist.**

- [ ] All 250 attachments parsed; `documents.unreadable` true for exactly the 8 problem files.
- [ ] The 15 `wrong_doc_type`, `missing_attachment`, `unreadable` reference cases escalate with the right reason; no other email escalates.
- [ ] The 94 "please send the draft" emails end `OK`, not `missing_attachment`.
- [ ] doc-extract tests pass; a 0-byte file and a garbled PDF return `unreadable` without a 500.

## Phase 6: Extraction and comparison

**Goal.** The full document check: seven fields with evidence, verification on doubt,
deterministic comparison, the complete submission. This is the phase that moves the 50%
end-to-end component.

**Build.**

- `prompts/extract/v1.md`, `prompts/extract-verify/v1.md`, `prompts/party-judge/v1.md`.
- `pipeline/compare/extract.ts` (calls structured LLM per document), `evidence.ts`,
  `normalise.ts`, `compare.ts`, `decide.ts`. Normalisers and compare are pure and heavily
  tested with the cases in `SDOC_BRIEF.md` section 7.6 and 7.5.
- Compare processor completes: extract → evidence → verifier on failure → normalise →
  compare → judge → decide → persist `extractions`, `extraction_fields`, `field_diffs`,
  update `comparisons`; `missing_value` escalations.
- Migrations: `extractions`, `extraction_fields`, `field_diffs`.
- Vision check: try one scanned page through the proxy; record the result in `PROGRESS.md`
  and wire vision only if it works.

**Exit checklist.**

- [ ] End-to-end on holdout at or above 0.80; full-set final score at or above 0.85. Numbers in `PROGRESS.md`.
- [ ] Zero self-inflicted `missing_value` escalations on `.txt`, `.docx`, `.xlsx` pairs.
- [ ] The 5 `missing_value` reference cases escalate as `missing_value`, not `MISMATCH`.
- [ ] The 3 UN/LOCODE false alarms from the brief (516, 518) produce no diff.
- [ ] Extraction verifier ran on under 20% of documents.

## Phase 7: Dashboard and email trace

**Goal.** A person can watch a run and understand any single decision without SQL.

**Build.**

- `GET /emails/:runId/:emailId` full trace contract; `GET /queues`; `run:{id}:counters` in Redis.
- `/runs/[id]`: stage funnel, queue depth, category mix, verifier share, cost, live feed, score card.
- `/emails/[runId]/[emailId]`: email, attachment viewer (text and page images via `/files`),
  classification panel with generator and verifier rationales, extraction table with
  source quotes highlighted in the document text, comparison table, escalation reason.
- `/files/*key` streaming route.
- Polling with SWR at the intervals in section 13.

**Exit checklist.**

- [ ] During a 2 emails/s run the funnel and feed update without page reloads.
- [ ] Opening a mismatch shows the differing field with SI and BL values and the quoted lines highlighted.
- [ ] Opening an unreadable case shows the rendered page image.
- [ ] No secret or ngrok URL appears in browser network requests.

## Phase 8: Review inbox

**Goal.** The human-in-the-loop path is real: see, decide, correct, upload, retry, and the
report updates.

**Build.**

- `review_actions` migration; `POST /review/:id/actions`, `POST /review/:id/upload`,
  `GET /review`.
- Actions per section 5.5, including reruns with `rerunFrom` and human values winning in
  normalise/compare.
- Failure cases (`kind = failure`, no `review_reason`) from the BullMQ `failed` handler; Failures tab; retry action.
- `/review` page: grouped by reason, case detail reusing the trace components, action bar,
  upload form.
- Each action stores a labelled example row (the raw material for phase 11).

**Exit checklist.**

- [ ] Correcting a weight on a `missing_value` case re-runs compare and the case closes with the new status.
- [ ] Uploading a BL to a `missing_attachment` case produces a full comparison.
- [ ] Stopping doc-extract mid-run creates failure cases; retry after restart clears them.
- [ ] Submission after review reflects human decisions.

## Phase 9: Priority, concurrency, ops

**Goal.** The queue behaves like a production queue: important clients first, nobody starved,
the proxy never overloaded, and the system reports its own health.

**Build.**

- `clients` seeding from dataset domains; `PUT /clients/:domain`; `/clients` page.
- Priority formula and tonnage parsing at enqueue; hourly priority cache job; aging job.
- Schedulers module with BullMQ repeatable jobs (priority cache, aging, heartbeat).
- Extended `/health` with worker heartbeat; structured logging audit across modules.
- Load test: burst-ingest 520 with concurrency 4+4; confirm no proxy 429s and no stalled jobs.

**Exit checklist.**

- [ ] With two tier-1 domains and a burst run, their emails complete before tier-3 emails on the timeline.
- [ ] A job waiting over 5 minutes has its priority reduced by the aging job (visible in `/queues`).
- [ ] In-flight LLM calls never exceed `LLM_MAX_CONCURRENCY` (assert via semaphore metrics).
- [ ] `/health` turns red within 60 s of stopping the worker.

## Phase 10: Analytics schema and chat agent

**Goal.** The ontology is queryable by people and by an agent, and the agent can explain any
decision from the audit trail.

**Build.**

- `analytics` schema migration: views from section 8.2; refresh job every 5 min and on run finish.
- `retina_ro` role and `DATABASE_RO_URL`; column grant excluding `llm_calls.request`.
- `agents/chat/loop.ts` and tools `describe_schema`, `run_sql` (guardrails per section 11),
  `get_email`, `explain_decision`.
- `chat_conversations`, `chat_turns` migrations; chat routes.
- `/chat` page: conversation list, messages, SQL block, result table.
- `backend/src/mcp.ts` exposing the same four tools over stdio (optional in this phase if time is short).

**Exit checklist.**

- [ ] "Which client had the most mismatches in run X and on which field?" returns a correct table with the SQL shown.
- [ ] "Explain email_407" narrates generator, verifier, evidence, diffs and any human action.
- [ ] `run_sql` refuses `delete`, multi-statement input, and queries over 5 s.
- [ ] Views refresh within 5 minutes of a run finishing.

## Phase 11: Eval tooling and gated lessons

**Goal.** Prompt changes are measured, and the system can propose improvements from human
feedback without being able to ship them unchecked.

**Build.**

- `prompt_versions` activation via `promptSet` on `POST /runs`; `eval:diff` between runs.
- `/eval` page: score history per run and prompt set; holdout view in dev.
- `lessons` migration; a job that drafts a candidate lesson from a batch of review actions
  (`prompts/lesson-draft/v1.md`); lessons are appended to the step's prompt as a versioned
  block when shipped.
- `POST /lessons/:id/approve`: runs holdout eval before and after on a shadow prompt version;
  ships only if no component drops; records both numbers.
- `/eval` page: candidate lessons with approve and reject.

**Exit checklist.**

- [ ] Two runs with different prompt sets show side by side with a diff of changed outcomes.
- [ ] A correction in the review inbox produces a candidate lesson within one job cycle.
- [ ] Approving a lesson that hurts the holdout is refused with both scores shown.
- [ ] A shipped lesson appears in the next run's `prompt_version`.

## Phase 12: Hardening and demo

**Goal.** Nothing surprising happens on stage.

**Build.**

- Fresh-seed test: regenerate the dataset with another `--seed` locally, run the pipeline, score
  with the local harness; fix anything keyed on this seed's quirks.
- Failure drills from section 17, each once, with the runbook updated.
- Rate-limited proxy drill: set `LLM_MAX_CONCURRENCY=2`, confirm graceful slowdown.
- Demo script following `01-product.md` section 5, timed, with a pre-seeded run in case the live
  one misbehaves.
- Final pass on docs: contracts match code, `PROGRESS.md` closed out, README updated.

**Exit checklist.**

- [ ] Fresh-seed final score within 0.05 of the original seed.
- [ ] Demo runs end to end twice in a row from a cold start.
- [ ] Rollback via `auto-deploy.sh` tested once on purpose.

## PROGRESS.md template

```markdown
# Progress

Current phase: 1

## Scores
| Phase | Holdout final | Full final | Stage1 | Stage3 | E2E | Notes |
|---|---|---|---|---|---|---|

## Phase checklists
### Phase 1
- [ ] ...

## Deferred
- (item, phase it belongs to, why deferred)

## Verified on the box
- proxy image passthrough: unknown
- proxy concurrency 8: unknown
- `subscription` alias maps to: unknown
```

## Splitting a phase

If a phase does not fit one session, split at the seam already drawn: phase 5 into "doc-extract
service" and "triage + escalations"; phase 6 into "extraction + evidence" and "normalise +
compare + decide"; phase 10 into "analytics + role" and "chat agent". Never split across a
seam (for example, half a processor).
