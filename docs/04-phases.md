# Retina SDOC: Phases

One phase = one Claude Code session. Each phase ends with something that runs end to end and
can be shown. Later phases only add; they never require rewriting an earlier phase's module.
Order matters: the score becomes visible in phase 2, the VPS is live in phase 3, and every phase
after that auto-deploys.

Session start: read `CLAUDE.md`, `PROGRESS.md`, this file's row for the phase, then the detailed
spec in `docs/phases/phase-NN-*.md`, which is the authoritative work list. Session end: exit
checklist green, `PROGRESS.md` updated, merged to `main`.

From phase 7 on, every screen is built against `docs/05-design.md` and the three files under
`docs/design/`. Those are the target state and nothing in `frontend/` follows them yet, so the
house rule applies: the doc wins for anything not built. A phase 7 or later session reads the
design language before the phase spec.

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
| 7 | Design system, dashboard and trace | The design language in code, the three pane shell, run view with live counters, per-email trace with the comparison row |
| 8 | Review inbox | Human actions, uploads, failures with retry |
| 9 | Priority, concurrency, ops | Client tiers, aging, semaphore, extended health, heartbeat |
| 10 | Ontology surfaces and chat agent | Star-schema views, read-only role, chat with a result graph, entity pages, search around, the ontology graph, and the Earth |
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
- `deploy/sim/`: removed on 2026-09-21. The deploy scripts have no local gate; see `deploy/README.md`.
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
- `llm-client`: retries with jitter while `isTransient(error)` holds (never a status list, see
  `phases/phase-04-handover.md`), `withLlmSlot` semaphore for `LLM_MAX_CONCURRENCY`,
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
- `pipeline/compare/triage.ts` (roles from the filename's claim and the model's word, which parts
  are present) and `structure.ts` (the escalation order), both table-driven tested. No
  fingerprint: `prompts/doc-type/v1.md` reads each document and names what it is, and
  `prompts/triage/v1.md` reads an empty comparison request.
- Compare processor: parse → doc-type → structure → persist `documents` → outcome
  `NEEDS_REVIEW` with `missing_attachment`, `wrong_doc_type`, or `unreadable`, else still `OK`.
- `classify/v5.md` (and `classify-verify/v2.md`): the attachments' extracted text as context for
  the category, inactive until a holdout run says it helps.
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

- `prompts/extract/v1.md`, `prompts/extract-verify/v1.md`, `prompts/field-judge/v1.md`: the
  model reads, the model judges. No normalisers, no label tables (amended 2026-09-19, see the
  phase spec).
- `agents/extract.ts` and `agents/field-judge.ts` (the calls), `pipeline/compare/evidence.ts`,
  `assemble.ts`, `decide.ts` (pure, table-driven tested with the cases in `SDOC_BRIEF.md`
  sections 7.5 and 9.3).
- Compare processor completes: extract → evidence → verifier on doubt → judge → assemble →
  decide → persist `extractions`, `extraction_fields`, `field_diffs`, update `comparisons`;
  `missing_value` escalations; a provisional result on scans.
- Migration `006`: `extractions`, `extraction_fields`, `field_diffs`.
- Vision check: the proxy's `claudecli` capabilities deny images, so page PNGs never reach the
  model; scans are compared on OCR text. Recorded in `PROGRESS.md`.

**Exit checklist.**

- [ ] End-to-end on holdout at or above 0.80; full-set final score at or above 0.85. Numbers in `PROGRESS.md`.
- [ ] Zero self-inflicted `missing_value` escalations on `.txt`, `.docx`, `.xlsx`, `.pdf` pairs of the main 500.
- [ ] The 5 `missing_value` reference cases escalate as `missing_value`, not `MISMATCH`.
- [ ] Port mutations with stale codes are caught (spot-check two `port_of_discharge` defects in txt pairs).
- [ ] Extraction verifier ran on under 20% of documents.
- [ ] Scanned pairs (512 to 514) escalate `unreadable` with a `provisional` result attached.
- [ ] Every judged field is in `field_diffs` and every extracted value in `extraction_fields` with its quote.

## Phase 7: Design system, the run page and the email page

**Goal.** A person can watch a run and understand any single decision without SQL, in the design
language of `docs/05-design.md`. This phase replaces the phase 1 palette and establishes the shell
every later screen inherits.

**Read first: `docs/phases/phase-07-handover.md`.** The design was settled on a canvas of eleven
artboards after this section was first written, and the handover says how to read it, what the API
does not return yet, and what to leave out. Three things this section originally asked for were
cut in review and must not be built: the provenance spine and its 60px row strip, the histogram
facets, and the stage bar.

The phase is large. If it does not fit one session, split at the seam: **7a** is the design system,
the shell and the run page, **7b** is the email page, the check and both documents. Never split
across a seam.

**Build, design system.**

- `globals.css`: the Air token set from `05-design.md` section 4, replacing the phase 1 harbour
  palette per the migration table in section 12. Newsreader for the one display line per page,
  Inter for UI, JetBrains Mono for data. Tokens as CSS variables and in the Tailwind theme; no
  second stylesheet.
- The shell (`05-design.md` section 7): a 232px rail that collapses to 56px, a 56px top bar with
  the ontology breadcrumb, and the panes. Every page must work at both rail widths.
- The component set from `design/screen-blueprints.md` section 14, and the distinctive ones from
  `05-design.md` section 8: the verdict chip with no dot, the marked span, the seam, the message
  card, the slot row, the evidence well, the type badge, the empty and failure states.
- **No status dot anywhere.** `05-design.md` section 2.1 principle 9. This is a review gate, not a
  preference.

**Build, screens.**

- `GET /emails/:runId/:emailId` full trace contract; `GET /queues`; `run:{id}:counters` in Redis.
- **The run page** (`design/screen-blueprints.md` section 3), in its three states: running, a
  dependency down, finished and scored. Two lanes left to right, one panel per queue with one row
  per email, and the outcomes list in the enum's own words. The memory panel renders only when
  `core.lessons` exists, which is phase 11.
- **The email page** (section 5): the message as a bordered card, the labelled seam, the reading in
  plain English, then the check. Tabs for `The check`, `Both documents` and `Model calls`. The
  `Links to` strip above the action bar.
- **The field comparison row** (section 6), which is the component this whole product exists to
  render. The difference is marked at the word on both sides; a `missing` field is the hatch.
- The `Both documents` tab with the rail closed, shared line numbers and the four marking states.
- The 340px chat column, present and inert, with its composer disabled and one sentence saying
  phase 10 turns it on. Drawing it now is what stops the page being relaid out twice.
- `/files/*key` streaming route. Polling with SWR at the intervals in `03-infra-deep.md` section 13.

**Out.** The database page and the ontology pages (phase 10b). The review queue and every write
path (phase 8). The chat itself (phase 10a). Lessons (phase 11).

**Exit checklist.**

- [x] No token from the phase 1 palette remains in `frontend/`; `globals.css` matches `05-design.md` section 4, and the three families load.
- [x] No status dot sits beside a chip, a row or a card anywhere in `frontend/`.
- [x] No JSON blob, model name, token count or dollar cost appears outside the run page's own machinery view.
- [x] During a 2 emails/s run both queue panels, the counters and the outcomes update without page reloads, and the two queues are visibly independent.
- [x] Stopping doc-extract mid run leaves the sorting panel running and the checking panel showing a held state that names the dependency and the retry, not an empty grid.
- [x] A finished run replaces its two queue panels rather than leaving them blank.
- [x] Opening a mismatch shows the message walled off from the reading by the seam, and the differing words marked on both sides, with nothing else on the row coloured.
- [~] A `missing_value` case renders the hatch, not a colour, and not the word "missing" in place of the value. Held by a unit test (`field-reading.test.ts` asserts a missing field never takes a difference mark) and by the component, which draws `Hatch` whenever a value is null. Not yet seen on screen: no email in the local runs produced a missing field, so the path wants one real case before this is ticked.
- [~] Opening an unreadable case shows its per page OCR confidence, and each page as a hatched page-shaped block rather than a rendered image. Rendering needs `docExtract.render` and `/files/*key`, which phase 8 brings for its upload path; see the phase 7 entry in `PROGRESS.md`.
- [x] The rail collapses to 56px and every page still works.
- [x] Every screen passes the accessibility checks in `05-design.md` section 10: 4.5:1 body contrast with nothing informational in `--ink-faint`, keyboard row navigation, no meaning carried by colour alone.
- [x] No secret or ngrok URL appears in browser network requests: every call is a same-origin `/api/*` route handler.
- [x] `eslint` clean, including the 200-line rule.

## Phase 8: Review inbox

**Goal.** The human in the loop path is real: see, decide, correct, upload, retry, and the report
updates.

**Read first: `docs/phases/phase-08-handover.md`.** The case pane phase 8 needs was drawn and built
in phase 7; this phase adds the queue in front of it and the write path behind it, and builds no
second component set.

**Build.**

- `review_actions` migration; `POST /review/:id/actions`, `POST /review/:id/upload`,
  `GET /review`.
- Actions per `03-infra-deep.md` section 5.5, including reruns with `rerunFrom` and human values
  winning in extract and compare.
- Failure cases (`kind = failure`, no `review_reason`) from the BullMQ `failed` handler; a failures
  group at the foot of the queue; a retry action.
- `/review` per `design/screen-blueprints.md` section 7: the same three pane shell with the list
  filtered to open cases, grouped by `review_reason` under neutral micro headers. The case pane is
  phase 7's email page in its NEEDS_REVIEW state, reused, not rebuilt.
- The action bar pinned above a hairline, in the order of section 5.5. `Correct field` edits inline
  on the comparison row so the source quote stays visible while the value is typed, never in a
  modal.
- Each action stores a labelled example row, which is the raw material for phase 11.

**Out.** The chat's proposed action card. The component is drawn and the write path it describes is
exactly this phase's, but nothing routes a chat turn into a `review_action` and no contract for it
exists. Phase 10 specifies that; phase 8 ships every action from the action bar.

**Exit checklist.**

- [x] Correcting a weight on a `missing_value` case re-runs compare and the case closes with the new status.
- [x] Uploading a BL to a `missing_attachment` case produces a full comparison.
- [x] A job that fails for good creates a failure case; retry clears it. **Stopping doc-extract does not:
      `failure-policy.ts` reads an unreachable dependency as an outage and pauses the queue with the job's
      attempts untouched, which is phase 5 working as designed. What reaches the failure handler is a
      permanent failure, such as doc-extract answering 404 for a key.**
- [x] Submission after review reflects human decisions.
- [x] The case pane is phase 7's component with a different tab selected; `git diff` shows no second review component set.
- [x] A correction never writes to one document as the correct value: the UI records what a person says and the product still reports symmetric difference.
- [x] Every action raises a toast naming what was written and what was re-queued.

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

## Phase 10: Ontology surfaces and the chat agent

**Goal.** The ontology is queryable by people and by an agent, the agent can explain any decision
from the audit trail, and the model itself is visible. This is the phase that makes the knowledge
layer a thing a judge can see rather than a claim in a README.

Split if needed: **10a** analytics, role and chat; **10b** the ontology surfaces (entity pages,
search around, the ontology graph); **10c** the Earth. Build in that order and stop wherever time
runs out: each is shippable on its own.

**Build, 10a.**

- `analytics` schema migration: views from section 8.2; refresh job every 5 min and on run finish.
- `retina_ro` role and `DATABASE_RO_URL`; column grant excluding `llm_calls.request`.
- `agents/chat/loop.ts` and tools `describe_schema`, `run_sql` (guardrails per section 11),
  `get_email`, `explain_decision`.
- `chat_conversations`, `chat_turns` migrations; chat routes.
- **The chat rail first**, not the chat page: the 340px column phase 7 drew inert
  (`design/screen-blueprints.md` section 5), turned on. It carries the scope chips naming what the
  conversation can see, the turns, and **the proposed action card**, which names the action kind
  and target, shows was and is, and writes nothing until `Apply and remember` is pressed.
- **The contract that does not exist yet**: what a chat turn may write. The card proposes a
  `review_action`, which is phase 8's table and phase 8's rerun behaviour. Specify it in
  `03-infra-deep.md` before building it, including who may apply one and what `Apply and remember`
  means beyond `Just this once`.
- `/chat` page per `design/screen-blueprints.md` section 10, for a question about the whole inbox
  rather than one email. Four artefacts per answer in a fixed order: **result graph, prose, SQL,
  result table.** The SQL block is never collapsed by default.
- The **chat result graph** (`design/ontology-patterns.md` section 3): a layered left-to-right
  graph of what the agent touched, built node by node as each tool returns, then frozen. The
  agent loop must emit the tool and relation names it used so the graph is drawn from fact, not
  inferred in the frontend.
- `backend/src/mcp.ts` exposing the same four tools over stdio (optional in this phase if time is short).

**Build, 10b.**

- `GET /ontology/:type` and `GET /ontology/:type/:id`: entity index and entity page contracts.
- `GET /ontology/:type/:id/around` returning `[{ linkType, label, count }]`, which is the whole
  of **search around** (`design/ontology-patterns.md` section 2.6). Two or three derived
  traversals per type, hand chosen, defined in one module beside the repositories.
- **The database page** per `design/screen-blueprints.md` section 8: one page, a segmented control
  between `As things` and `As rows`, and the record underneath. As rows is the typed grid with the
  SQL along the bottom and a drawer per row; as things is the entity list that opens in place into
  what is stored, step out from here, written these ways, and where it appeared; the record is the
  full page with the appearance history and the tree.
- `written these ways`, the component that makes the ontology's argument: the spellings the field
  judge accepted as one thing, each with how often it was seen and how it was judged. It reads
  `field_diffs` and the extraction rows; nothing in it comes from a lookup table.
- Entity index and entity pages per `design/screen-blueprints.md` section 8, one shape for every
  type. The ontology group in the rail becomes live.
- The ontology page, two tabs: `Record` and `Links` (`ObjectTyped.dc.html`, `GraphLinks.dc.html`).
  A third tab, Rows and columns, was drawn and cut because the database page does the same job
  better.
- The **ontology graph** page (`design/ontology-patterns.md` section 5): object types, link
  types, live row counts, hierarchical layout, and a `built` / `planned` status legend so the
  types that are designed but not yet in the schema are drawn honestly. This is the best candidate
  for the third ontology tab if one is wanted.
- Shipment level entities (`shipments`, `parties`, `ports`, `carriers`) populated from verified
  extractions, which `03-infra-deep.md` section 8.1 defers to "a later phase". This is it. Until
  they exist, their nodes render `planned`.

**Build, 10c, optional.**

- The **Earth view** (`design/ontology-patterns.md` section 4): globe and flat projections, a
  light basemap with no tile provider, port markers, great circle lanes, the capped traffic
  animation with its reduced motion fallback, the Layers and Find panels, the ranked table, the
  Unplaced list, and the run replay scrubber.
- A static UN/LOCODE gazetteer in the frontend. No fuzzy port matcher: LOCODE or exact name, and
  everything else is Unplaced.

**Exit checklist.**

- [ ] "Which client had the most mismatches in run X and on which field?" returns a correct table with the SQL shown.
- [ ] "Explain email_407" narrates generator, verifier, evidence, diffs and any human action.
- [ ] `run_sql` refuses `delete`, multi-statement input, and queries over 5 s.
- [ ] Views refresh within 5 minutes of a run finishing.
- [ ] The chat result graph draws only tools and relations the agent reported, and a tool that returned zero rows still appears with a `0`.
- [ ] Search around from an email reaches its documents, fields, diffs, calls and client, and every count matches a direct query.
- [ ] The ontology graph's counts are live and its `planned` nodes are exactly the types with no table.
- [ ] 10c only: the Earth's ranked table and the map agree, an unknown LOCODE appears under Unplaced rather than being placed, and `prefers-reduced-motion` replaces the traffic with static arrowheads.

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

## Phase 13: Business data pages and the chat dock

**Goal.** Companies, ports and shipments get pages of their own, with card, table and map
views, and the chat becomes a dock that survives navigation and carries the open page as context.

**Build.** See `docs/phases/phase-13-business-data.md`.

**Exit checklist.** As the phase doc lists it.

## Phase 14: the ingest gate

**Goal.** An email cannot cost us a model call until a deterministic function has said it may.
The design is `docs/phases/phase-14-ingest-gate-design.md` and the work list
`docs/phases/phase-14-ingest-gate.md`.

**Why now.** `ingest/` replays one inbox the organisers wrote, so today nothing untrusted reaches
it. The moment a mail connector is the source, anyone can spend our money by sending a lot of mail
or mail with a lot in it, and `Source` is already the seam that would carry it.

**Build.**

- `pipeline/gate/`: four pure functions. `cost` prices an email in model calls, `standing` turns
  distinct active days into a bracket, `growth` clamps a day to three times the sender's own
  fortnight, `decide` is the only place they meet.
- `ingest/gate/`: three token buckets in one Lua script (address, domain, global), the day's
  budget read from `core.llm_calls`, and the thin function that loads, decides and records.
- A verdict before the first attachment is copied, so a hold costs two queries and no tokens.
- `/gate` routes and the `/gate` page: what it is doing, what each sender has earned, and the
  holding pen with a Release button.

**The rule the phase hangs on.** `From` is forgeable, so an automatic rule may only hold and only
a person may block. Nothing here deletes mail, and nothing here decides a category.

**Exit checklist.** In `docs/phases/phase-14-ingest-gate.md`.


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
compare + decide"; phase 7 into "design system + shell" and "trace + comparison row"; phase 10
into "analytics + chat", "ontology surfaces" and "the Earth". Never split across a seam (for
example, half a processor, or tokens without the components that use them).
