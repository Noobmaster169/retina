# Progress

Current phase: 2

## Scores
| Phase | Holdout final | Full final | Stage1 | Stage3 | E2E | Notes |
|---|---|---|---|---|---|---|
| 1 | n/a | n/a | n/a | n/a | n/a | No classification yet: every email ends `done` / `OK` |
| 2, prompt v1 | 0.2129 | not run | 0.7098 holdout | 0 | 0 | Zero-shot sonnet. All 25 holdout SI_REQUEST read as BL_COMPARISON: the definition was wrong |
| 2, prompt v2 | 0.2981 | incomplete, see below | 0.9938 holdout (103 of 104) | 0 | 0 | Zero-shot sonnet, categories defined by paperwork stage. Stage 3 and E2E are 0 until phases 5 and 6 read the documents |

Stage 1 carries 0.30 of the final score, so 0.2981 is what a perfect classifier with no document
check would get (0.30). The holdout final cannot rise further until phase 5.

## Phase checklists
### Phase 1 (done, 2026-09-19, local)
- [x] POST /runs ingests all 520 emails; email_runs has 520 rows at done
      (run 4d04592a at 5/s: 520 rows, 520 distinct emails, all `done`, 0 retried)
- [x] Every attachment in MinIO with matching sha256 (250 objects)
      (250 of 250 objects match sha256 and size; 126 SI + 124 BL; 250 listed under the run prefix)
- [x] Worker kill and restart finishes the run with no duplicates
      (force-killed at 107 done with one email in `classifying` and its job orphaned `active`;
      the ingest job was reclaimed about 25 s after restart, the classify job after its 120 s lock;
      final state 520 `done`, nothing stuck)
- [x] Pause and resume work
      (paused at 38, still 38 five seconds later, resumed from the next email)
- [x] /runs page shows counts moving; unauthenticated visit redirects to /login
      (checked in a browser with `SITE_PASSWORD` set: redirect to `/login?next=/runs`, sign in, a
      60-email run appeared and reached 60 / 60 with no reload)
- [x] /health reports all checks; stopping MinIO flips to degraded
      (degraded with HTTP 200 while MinIO was stopped, ok again after it started)
- [x] pnpm test and pnpm type-check pass (77 backend tests; frontend type-check and lint clean);
      no `process.env` outside `config.ts`

### Phase 1 code review (2026-09-19)
Ten findings, all fixed on `phase-01-skeleton` before the merge. How each was checked is in brackets.
- [x] A resume could leave two ingest loops on one run, doubling its rate. `core.runs.ingest_epoch`
      (migration 002): every resume raises it, the job carries it, an older loop stands down as
      `superseded`. (Live at 0.5/s, limit 8: paused and resumed inside one sleep, the old loop
      stopped at 2 ingested, the run ended 8 `done`. Same when resumed before the first job began.)
- [x] A resume whose job could not be queued left the run `running` with no job. It returns to
      `paused`. (Route test.)
- [x] `GET /runs` and `GET /runs/:id` were 503 without Redis. `queues` is nullable. (Live with
      Redis stopped: 200 in 40 ms, `queues: null`.)
- [x] A queue command issued while Redis was down was delivered on reconnect, after its caller had
      been told it failed. Commands are refused while the connection is down. (Live: `POST /runs`
      was 503 in 14 ms, the run `failed`, and nothing ran when Redis came back.)
- [x] A rejection inside a worker's async `failed` listener was unhandled and killed the worker.
      Guarded and logged. (By reading; not exercised live.)
- [x] Repeated `emailIds` inflated `totalEmails`. Dropped in `CreateRunBody`. (Route test.)
- [x] A failed job removal made a committed cancel answer 503. Logged instead; the processors
      skip a cancelled run. (Route and processor tests.)
- [x] `ingestEmail` held a transaction and a pooled connection across downloads and uploads.
      Transfers now happen first. (Existing ingest tests; the 520-email run was not repeated.)
- [x] `/api/runs` was in the proxy matcher, so a signed-out poll got the login page as a 200.
      Removed; the handlers answer a JSON 401. `/api/runs/<id>/constructor` is a 404. (Type-check
      and lint only; not opened in a browser.)
- [x] Shutdown and the client components no longer drop errors. (Type-check only.)

### Phase 2 (built 2026-09-19, local; one item open)
- [x] `pnpm eval:parity` passes: the TS scorer and `score_cli.py` agree to four decimals
      (7 cases: the sample, an empty submission, the truth itself, and four seeded noisy submissions
      from final 0.0124 to 1.0 with up to 46 end-to-end successes; every number agrees)
- [x] No rule decides a category (nothing under `pipeline/classify/` or in the classify processor
      branches on sender, subject or body; `registry.test.ts` fails if the shipped prompt names a
      sender, domain or subject code from the inbox)
- [x] Every enum is the organisers', value for value (`contracts.test.ts` reads `scoring.py` and the
      README; the check constraints were exercised: three valid rows accepted, six invalid rejected)
- [x] Zero-shot stage 1 macro-F1 at or above 0.90 on the holdout, on `sonnet`
      (`v2`: 0.9938, 103 of 104. The miss is `email_504`, a `wrong_doc_type` case read as SI_REQUEST
      at confidence 0.70. `v1` was 0.7098)
- [ ] **OPEN: a clean run of all 520.** The full run classified 429 emails and then failed the
      last 91 in four seconds with "classify/v3.md has bad frontmatter", before any model call.
      Cause: a second session was editing this checkout at the same time and added a `v3.md` that
      is valid under its edited registry and not under the code the running worker had loaded; the
      worker reads the newest prompt file on every call. Not a model or pipeline failure. The 429
      that ran are 429 of 429 correct, 341 of them train ids that played no part in writing `v2`.
      Repeat the full run once that session's changes are committed, then tick this and the next.
- [ ] **OPEN, same cause:** submission of all 520 ids from one complete run, and `final_score` from
      the UI equal to `pnpm eval:score` on the full set. What was verified instead, on the 104-email
      holdout run: the organisers' scorer answered 0.07280788387344309 and the local scorer gave
      0.07280788387344309 for the same payload, and the payload was stored before it was sent.
- [x] One `llm_calls` row per attempt with tokens, cost and latency
      (holdout `v2`: 104 calls, 0 failed, 0 retries, 7.7 s average, 11.87 USD at API prices)
- [x] `eval/split.json` committed (416 train, 104 holdout, 9 of the 46 defects held out);
      `eval/reports/` gitignored
- [x] 152 backend tests, type-check clean in both packages, frontend lint clean; the production
      image builds and boots with no Redis, MinIO or answer key (`/health` 200 degraded, `/eval` 404,
      submit 503)

How the holdout was used, stated plainly: it was read twice. The `v1` read is what showed the
SI_REQUEST definition was wrong. The fix came from the organisers' generator, not from the holdout
emails, and was checked on 60 train emails (60 of 60) before the holdout was read again. The 341
train ids in the interrupted full run are the cleaner evidence: none was looked at, all correct.

## Design decisions
- 2026-09-19, **no hand-written classification rules.** The original phase 2 was a rules engine
  (spam sender list, subject keyword table, body patterns, body cleaning by pattern), all read off
  these 520 emails. The inbox is one small seeded draw and the judges may score another, so a rule
  fitted to it is an assumption. The LLM classifies every email; prompts describe the task in the
  organisers' words and name nothing from the dataset; the eval harness measures. Phase 2 is now
  "LLM classification, submission, first score" and pulls the minimal LLM layer forward; phase 4
  is "Classification quality" (prompt versions, verifier, gated few-shot, model comparison). The
  same reasoning moved phase 5's "was a comparison requested" from body-verb regexes to the model.
  Cost of the decision: a full run is 520 LLM calls, and the `claudecli` provider serves 2 at a
  time, so tens of minutes instead of seconds. Develop on the holdout ids.
- 2026-09-19, **the organisers' enums, value for value.** `category`, `status`, `review_reason` and
  the seven field names come from `emails/data_v2/README.md` and `scoring.py` and are never
  extended. The design had two extra review reasons, `low_confidence` and `processing_error`; both
  are gone from every doc and from migration 003. A job that fails for good is a failure
  (`email_runs.stage = failed`; from phase 8 a review case of `kind = failure` with no reason), not
  a review reason. A value the extractor cannot locate is a `missing_value`. The party judge always
  decides. The README's status table is enforced by check constraints (verified against the dev
  database: the three valid rows accepted, six invalid ones rejected).

- 2026-09-19, **the document steps go to the model too.** Asked whether phase 5's title-matching
  fingerprint and phase 6's normalisers should stay code, the answer was the model. Document type
  is an LLM call; whether an SI value and a BL value mean the same thing is an LLM call per field
  (the field judge). Code only assembles the fields judged different into `defect_fields` and
  validates the names against the enum, which keeps the submitted set exact. Phases 5 and 6 carry
  an "Amended" section that governs their older work items.
- 2026-09-19, **`sonnet` for every LLM step.** Classify, verify, triage, document type, extraction,
  field judge, chat. `LLM_MODEL_<STEP>` stays for experiments; the default does not move without
  the user saying so.

## Deferred
- A run does not pin its prompt version: the worker resolves the newest file on every call, so a
  prompt added mid-run changes the run halfway, and it is how the full run above was broken.
  Phase 4's `promptSet` fixes it by resolving the version once, when the run is created.
- The Score column was checked over HTTP (server render, the submit and eval handlers, error
  paths), not clicked in a browser: the browser tool failed to connect in the building session.
- A full run is 520 sonnet calls at 2 at a time: about 40 minutes, and about 59 USD at API prices
  (nothing is billed on the subscription rail, but it uses the subscription's limits).
- Worker, Redis and MinIO on the VPS, phase 3. After this merges the box still runs only the api,
  which boots without them and reports `redis` and `minio` as `down` in `/health` (HTTP 200).
  There `GET /runs` lists runs with `queues: null`, and `POST /runs` answers 503, until phase 3.
- `pnpm test` in CI, phase 3. The suite needs Postgres; the workflow only type-checks today.
- Graceful shutdown of the ingest job (SIGTERM, `moveToDelayed`) is covered by the replay unit
  test only. Windows cannot deliver SIGTERM to the node process, so it was not exercised live.
  Exercise it on the box in phase 3. The hard-kill path was exercised live and works.
- Attachments are copied per run (250 objects each). Dedupe by sha256 later if disk matters.
- A cancelled run's emails stay at the stage they reached; there is no `cancelled` stage. Add one
  if a later dashboard needs to tell them from emails still in flight.
- One `emailIds` entry that is not in the inbox fails the whole run with a terminal error naming
  it. Kept on purpose: skipping it would leave `totalEmails` unreachable. Validate at `POST /runs`
  if it ever matters.
- A worker that cannot record a final job failure (database down) leaves that email at
  `classifying` or `comparing`. The guard stops the crash, not the missed write. Phase 8's review
  queue should sweep for emails whose job sits in BullMQ's failed set.
- `core.clients` exists and is empty. Phase 9 seeds the tiers. There is no spam list.

## Verified on the box
- proxy image passthrough: unknown
- proxy concurrency 8: unknown
- `subscription` alias maps to: unknown
- BullMQ job.changePriority available: unknown (installed BullMQ is 6.3.6; `Job.changePriority` is in its types)

## Found while building
- A category definition can be wrong while the model is right. `v1` missed 25 of 25 SI_REQUEST on
  the holdout because it defined the category as "asks for an SI". The organisers' generator shows
  an SI_REQUEST hands the instruction over. Read their definition before blaming the model.
- The model's stated confidence tracks its errors: `v1` left 16 of 104 below 0.8, where its
  mistakes were; `v2` leaves 2, one of them the single miss. That is the phase 4 verifier trigger.
- Two sessions in one checkout collide through the filesystem even without touching the same
  lines: a long-running worker picked up the other session's new prompt file mid-run.
- On Windows the proxy venv is `.venv/Scripts/python.exe`, and port 4000 may belong to another
  project's proxy with different aliases. This repo's proxy runs on 4001 locally.
- BullMQ 6 rejects a custom job id containing `:`, and `job.discard()` no longer exists.
- `minio/minio` is gone from Docker Hub; `quay.io/minio/minio` and `quay.io/minio/mc` work.
- A BullMQ job with a priority waits in `prioritized`, not `waiting`. Count and cancel both.
- With Redis down, a BullMQ command waits forever. Anything called from a request needs a timeout.
- A timeout alone is not enough: the command stays queued and runs on reconnect. Check the
  connection first and refuse (`redisIsDown` in `queues/connection.ts`).
- An EventEmitter drops the promise an async listener returns. Wrap async BullMQ listeners.
