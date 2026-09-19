# Retina SDOC: Infrastructure deep dive

Build reference. Assumes `01-product.md` and `02-infra-overview.md`. Everything here is a
decision unless marked *verify*, which means confirm on the box before relying on it.

## 1. Repository layout

Additions to the Retina repo. Existing files keep their roles.

```
backend/
  src/
    app.ts                 existing routes + new route modules mounted here
    worker.ts              NEW entrypoint: starts queue consumers + schedulers
    auth.ts                existing two bearer keys
    llm.ts                 existing proxy client, extended with structured-output helper
    db.ts                  existing pool + NEW read-only pool for the chat agent
    config.ts              env parsing (zod)
    routes/                runs, emails, review, chat, eval, clients, queues, files
    queues/
      names.ts             queue names, job types, priority helpers
      connection.ts        ioredis instance
      classify.worker.ts
      compare.worker.ts
      schedulers.ts        repeatable jobs: priority cache, analytics refresh, aging
    ingest/
      source.ts            Source interface
      averis.source.ts     AverisReplaySource
      replay.ts            run controller (start, pause, rate)
    pipeline/
      classify/            input.ts, decide.ts (no rules: the LLM classifies, see 5.2)
      compare/             triage.ts, fingerprint.ts, extract.ts, evidence.ts,
                           normalise.ts, compare.ts, decide.ts
      escalate.ts          review case creation
    agents/
      prompts/             <step>/<version>.md, registry.ts
      structured.ts        JSON schema call + zod parse + retry
      chat/                loop.ts, tools/{describe_schema,run_sql,get_email,explain_decision}.ts
    ontology/
      repositories/        one module per aggregate (emails, documents, comparisons, reviews...)
      submission.ts        builds the scorer JSON for a run
    eval/
      split.ts             stratified 80/20, writes eval/split.json
      score.ts             TS port of scoring.py
      run-eval.ts          CLI: score a run against ground truth on holdout + full
    storage/
      minio.ts             client, key builders, presign
  db/migrations/           NNN_*.sql, applied by existing migrate.mjs
services/
  doc-extract/             Python FastAPI service (Dockerfile, app.py, extractors/, requirements.txt)
deploy/
  compose.yaml             extended: redis, minio, worker, doc-extract, averis
  averis/                  their server/ + data_v2/ minus ground_truth.json (see 15)
  auto-deploy.sh           recreates api, worker, doc-extract
docs/
  01-product.md  02-infra-overview.md  03-infra-deep.md  04-phases.md  phases/  PROGRESS.md
frontend/
  app/(gated)/runs, emails/[id], review, chat, eval
  lib/api-client.ts        extended contract
  middleware.ts            password gate
```

## 2. Compose services (VPS)

`deploy/compose.yaml`, all on one private network `retina`. Only `api` publishes a port.

| Service | Image | Ports | Volumes | Notes |
|---|---|---|---|---|
| postgres | postgres:17 | none | pgdata | healthcheck `pg_isready` |
| redis | redis:7 | none | redisdata | `command: redis-server --appendonly yes --maxmemory-policy noeviction --maxmemory 512mb` |
| minio | quay.io/minio/minio (`minio/minio` is gone from Docker Hub) | none (console reachable via `docker compose exec` or an SSH tunnel) | miniodata | `server /data --console-address :9001`; init job creates bucket `retina` |
| api | ghcr.io/noobmaster169/retina-api:main | `127.0.0.1:8091:8091` | none | runs migrations then listens; depends on postgres, redis, minio healthy |
| worker | same image | none | none | `command: node --import tsx src/worker.ts` (no build step; the image runs TypeScript through tsx); depends on api healthy (migrations done) |
| doc-extract | built from `services/doc-extract` | none | none | `:8000` inside network; healthcheck `/healthz`; 1 GB memory limit |
| averis | built from `emails/server` | `127.0.0.1:8080:8000` | `emails/data_v2:/data:ro`, answer key mounted at `/secrets:ro` | organiser image, unchanged code |

Averis is kept in the same compose file, as the service `inbox`, so `api` and `worker` reach it
as `http://inbox:8000`.
The answer key volume is attached to `averis` only. `api` and `worker` never mount it.

Redis settings explained:

- `appendonly yes`: jobs survive a Redis restart.
- `noeviction`: Redis returns an error under memory pressure instead of silently deleting keys.
  BullMQ requires this.
- `maxmemory 512mb`: 520 emails is tiny; this is a safety cap for a runaway producer.

## 3. Environment variables

Backend (`deploy/.env`, mirrored in `backend/.env.example`):

| Variable | Example | Used by |
|---|---|---|
| `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD` | `postgres`, `5432`, `retina_prod`, `retina`, ... | api, worker. Discrete vars, the house convention; there is no `DATABASE_URL` |
| `DATABASE_RO_URL` | `postgres://retina_ro:...@postgres:5432/retina_prod` | api (chat agent) |
| `REDIS_URL` | `redis://redis:6379` | api, worker |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` | `minio:9000`, ..., `retina` | api, worker |
| `MINIO_PUBLIC_ENDPOINT` | `https://<ngrok>/files` | api (presigned URLs are proxied, see 10) |
| `DOC_EXTRACT_URL` | `http://doc-extract:8000` | worker |
| `EMAIL_SERVER_URL` | `http://inbox:8000` (already set in `deploy/compose.yaml`) | api, worker |
| `LLM_PROXY_URL` | `http://172.17.0.1:4000` | api, worker |
| `LLM_MODEL_CLASSIFY`, `LLM_MODEL_VERIFY`, `LLM_MODEL_EXTRACT`, `LLM_MODEL_CHAT` | `sonnet` for every step. Must be a proxy alias from `proxy/proxy.yaml` | worker, api |
| `LLM_MAX_CONCURRENCY` | `8` | worker (global semaphore) |
| `CLASSIFY_CONCURRENCY`, `COMPARE_CONCURRENCY` | `4`, `4` | worker |
| `API_SHARED_SECRET`, `TEAM_API_KEY` | hex | api |
| `SITE_PASSWORD` | string | frontend middleware (Vercel env) |
| `EVAL_GROUND_TRUTH_PATH` | local path only, unset on the VPS containers | eval CLI |

Frontend (Vercel): `BACKEND_URL`, `API_SHARED_SECRET`, `SITE_PASSWORD`, `SESSION_SECRET`.

## 4. Queues

### 4.1 Redis key usage

| Key | Type | Purpose |
|---|---|---|
| `bull:classify:*`, `bull:compare:*` | BullMQ | the two queues |
| `client:priority` | hash `domain -> tier(1..5)` | enqueue-time priority lookup |
| `run:{runId}:counters` | hash | cheap live counters for the dashboard (ingested, classified, compared, review) |
| `worker:heartbeat` | string, 60 s TTL | worker liveness for `/health` |

### 4.2 Queue definitions

| Queue | Job name | Payload | Producer | Consumer |
|---|---|---|---|---|
| `classify` | `classify-email` | `{ runId, emailId }` | replay controller, review "reclassify" | classify.worker |
| `compare` | `compare-email` | `{ runId, emailId, rerunFrom?: "triage" \| "extract" \| "compare" }` | classify.worker, review actions | compare.worker |

Job options, both queues:

```ts
{
  jobId: `${runId}__${emailId}`,         // idempotency; BullMQ rejects a custom id containing ":"
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 86400 },
  removeOnFail: false,                   // kept for inspection; also mirrored to review_cases
  priority,                              // see 4.3
}
```

Worker options: `concurrency` from env, `lockDuration: 120000` (LLM calls can be slow),
`stalledInterval: 30000`. A job that stalls (worker died) is retried automatically.

### 4.3 Priority

BullMQ: lower number = served first. Range used: 1 to 1000.

```
tier        = redis HGET client:priority <sender domain>   (default 3)
tonnage     = integer parsed from subject, e.g. "__138MT" -> 138 (default 0)
tonnageBonus= min(floor(tonnage / 10), 99)
priority    = tier * 200 - tonnageBonus          // tier 1 & 500 MT -> 150; tier 5 & 0 MT -> 1000
```

Aging: a repeatable job every 60 s lists `waiting` jobs older than 5 minutes and calls
`job.changePriority({ priority: max(1, current - 100) })`. Prevents starvation during bursts.

Client tiers come from `core.clients` (manual `tier` column, seeded from the sender domains in
the dataset). A repeatable job every hour writes the table into the `client:priority` hash. A
`PUT /clients/:domain` route updates both immediately.

### 4.4 LLM concurrency cap

An in-process semaphore of size `LLM_MAX_CONCURRENCY` wraps every proxy call (default 8 in
the worker, 2 in the api for chat). One process, one cap; no Redis coordination is needed while
there is one worker replica.

### 4.5 Failure handling

- Attempts 1 and 2 fail: BullMQ retries with backoff. Stage row records `attempt`.
- Attempt 3 fails: the `failed` event handler sets `core.email_runs.stage = failed` with the
  error. From phase 8 it also opens a `core.review_cases` row of `kind = failure` with no
  `reason`: a failure is not one of the organisers' review reasons. The dashboard's
  "Failures" tab reads these. "Retry" re-adds the job with `rerunFrom` and a fresh `jobId`
  suffix `__r{n}`.
- Errors are classified: `RetryableError` (proxy 503, timeouts, doc-extract 5xx) vs
  `TerminalError` (schema validation failed twice, unsupported file type). Terminal errors skip
  remaining attempts: the worker rethrows them as BullMQ's `UnrecoverableError` (`job.discard()`
  no longer exists in BullMQ 6).

### 4.6 Stage state machine

`core.email_runs.stage`, one row per (run, email):

```
ingested -> classifying -> classified -> [done]
                                      -> comparing(triage) -> comparing(extract)
                                      -> comparing(compare) -> done
any stage -> review (review_cases row open) -> done (after human action)
any stage -> failed (a failure case, which carries no review_reason)
```

## 5. Pipeline stages

### 5.1 Ingest

```ts
interface Source {
  listEmailIds(): Promise<string[]>;
  getEmail(id): Promise<{ email_id, from, subject, body, attachments: string[] }>;
  readAttachment(path): Promise<{ bytes: Buffer; contentType: string }>;
}
```

`AverisReplaySource` wraps `GET /emails`, `GET /emails/{id}`, `GET /attachments/{path}`.

Replay controller (`ingest/replay.ts`), driven by `core.runs`:

- `POST /runs { source: "averis", ratePerSecond: 2, limit?: number, emailIds?: string[] }`
  creates a run and adds a single `ingest-run` repeatable-until-done job on a small internal
  queue `ingest`. The worker takes one email per tick, so pausing a run means pausing that job.
  Repeated `emailIds` are dropped.
- The `ingest-run` payload is `{ runId, epoch }`. A new run starts at epoch 0.
  `POST /runs/:id/resume` raises `core.runs.ingest_epoch` and adds a job
  `${runId}__resume__${epoch}` carrying the new value. A loop checks status and epoch before
  every email and stands down as `superseded` when the epoch has moved on, so an older job that
  was still waiting, or asleep between two emails, never ingests alongside the new one. If the
  resume job cannot be queued the run goes back to `paused`.
- Cancel commits `cancelled`, then removes the run's jobs that have not started. A failed
  removal is logged, not returned. The classify and compare processors return at once for a
  cancelled run, which covers a job that was already active or added a moment later. The run's
  emails stay at the stage they had reached.
- Per email: copy attachments to MinIO under the run prefix, then in one short transaction
  insert `core.emails` (upsert on `email_id`; content is identical across runs),
  `core.attachments` and `core.email_runs`, then enqueue `classify`. Downloads and uploads
  happen before the transaction opens, so a slow inbox or MinIO never holds a pooled connection.
- `ratePerSecond: 0` means burst: enqueue everything immediately.

### 5.2 Classify

**No rules.** Nothing in the pipeline decides a category from a sender list, a subject keyword
or a body pattern. The 520 emails are one seeded draw; a rule fitted to them is an assumption
about the next draw. The model classifies, and the eval harness measures it.

**Input** (`classify/input.ts`, pure): the sender address, the subject, the attachment file names
and the body, cut at `CLASSIFY_BODY_CHARS` with a marker when cut. The cap is a cost guard.
Nothing is stripped, reordered or normalised.

**Generator** (`prompts/classify/v1.md`). Defines the five categories in the organisers' words
(the brief and `emails/data_v2/README.md`), says that a body may carry a forwarded thread, a
signature and a warning banner and that the category follows what the sender is asking for now.
It names no sender, domain, subject code or phrase from the dataset. Zero-shot in phase 2; phase
4 adds few-shot examples from the train split only if a holdout run shows they help. Output (JSON
schema enforced, category restricted to the enum):

```json
{ "category": "BL_COMPARISON", "confidence": 0.93, "rationale": "The sender asks for the draft BL to be checked against the SI; two attachments are named as an SI and a BL." }
```

**Verifier trigger** (phase 4): `gen.confidence < VERIFY_BELOW`, a constant chosen on the train
split. The model's own confidence is the only input; there is no branch on email content.

**Verifier** (`prompts/classify-verify/v1.md`) receives the same input plus the generator's
proposal and is told to argue for the strongest alternative before deciding. Output:

```json
{ "category": "GENERAL", "agrees": false, "confidence": 0.88, "rationale": "..." }
```

**Decision**: the verifier's category if it ran, else the generator's. `classifications.decided_by`
is `llm`, `verifier` or `human`. The submission's `decided_by` is always `llm`.

### 5.3 Compare

**Triage** (`compare/triage.ts`):

- Count attachments; assign roles from the filename suffix (`_SI`, `_BL`), otherwise from the
  fingerprint below.
- Detect whether a comparison was requested: body verbs. `compare`, `check the attached`,
  `verify against`, `confirm the draft` with attachments expected → comparison requested.
  `please send`, `share the draft`, `forward the BL` with no attachments → nothing to compare,
  outcome `OK`, no escalation.
- Comparison requested and BL missing (0 files, or SI only) → `NEEDS_REVIEW / missing_attachment`.

**Document type** (`prompts/doc-type/v1.md`). The model reads the extracted text of each file
and answers `{ doc_type: "SI" | "BL" | "INVOICE" | "PACKING_LIST" | "COO" | "OTHER", confidence,
rationale }`. There is no title table or label list in code: what a Commercial Invoice looks like
is the model's knowledge, not a pattern read off this dataset. The filename suffix is passed in as
a claim to check, never trusted.

Expected role BL but the model says it is another document → `NEEDS_REVIEW / wrong_doc_type`.

**Parse**: call doc-extract (section 6). `unreadable: true` on either document →
`NEEDS_REVIEW / unreadable`, with the page image key attached for the reviewer.

**Extract** (`prompts/extract/v1.md`), one call per document. Input: document role, full text
(or OCR text with per-page confidence), the label synonym table as guidance, and the note that
labels may carry parenthetical Chinese glosses. Output:

```json
{
  "shipper":           { "value": "APRIL FINE PAPER TRADING PTE LTD", "source_quote": "Shipper: APRIL FINE PAPER TRADING PTE LTD", "confidence": 0.98 },
  "consignee":         { "value": "...", "source_quote": "...", "confidence": 0.9 },
  "notify_party":      { "value": null, "source_quote": null, "confidence": 0, "note": "no notify label found" },
  "port_of_loading":   { "value": "NANTONG, CHINA (CNNTG)", "source_quote": "POL: NANTONG, CHINA (CNNTG)", "confidence": 0.97 },
  "port_of_discharge": { ... },
  "container_count":   { "value": "6 x 40'HC", "source_quote": "Total Containers: 6 x 40'HC", "confidence": 0.99 },
  "gross_weight_kg":   { "value": "67,311 KG", "source_quote": "Gross Weight毛重(KGS): 67,311 KG", "confidence": 0.99 }
}
```

Values are returned raw. Normalisation is code, so the model is never asked to do arithmetic.

**Evidence check** (`compare/evidence.ts`): for each field with a value, `source_quote` must
appear in the document text after whitespace normalisation. Fails → field marked
`evidence_failed`. If any field fails or has confidence below 0.7, run the extraction verifier
(`prompts/extract-verify/v1.md`) on that document with the failing fields highlighted; it
returns the same shape and replaces those fields. Still failing → treat the field as missing
with `note = "verifier could not locate"`.

**Field judge** (`prompts/field-judge/v1.md`). For each of the seven fields the model receives
the raw SI value and the raw BL value with their source quotes and answers
`{ same: boolean, missing: boolean, confidence, rationale }`. `same` means the two values denote the
same thing in a shipping document: `131,058 KG` and `131058`, a port with and without its
UN/LOCODE, a company name with and without its address lines. `missing` means either side is
blank or a placeholder, which is uncertainty and never a difference. The prompt states those
principles from the organisers' text; it lists no normalisation rules and no values from the
dataset.

There are no normalisers in code: no unit tables, no suffix lists, no code stripping. Code does
one thing (`compare/assemble.ts`, pure): collect the fields judged `same: false` into
`defect_fields`, collect the fields judged `missing` into a `missing_value` escalation, and validate
every name against the `ComparisonField` enum. That keeps the submitted set exact without the
model ever writing the final list free-hand. The judge always decides; an unsure judgement is not
an escalation, and its confidence is stored for the reviewer.

**Decide** (`compare/decide.ts`):

```
if any escalation reason collected  -> NEEDS_REVIEW (first reason by precedence:
                                        unreadable > wrong_doc_type > missing_attachment > missing_value)
else if diff set empty              -> OK
else                                -> MISMATCH, defect_fields = diff set
```

The submission row is derived, never hand-written:

```
category      = classification.category
status        = OK | MISMATCH | NEEDS_REVIEW
review_reason = reason or null
has_defect    = status == MISMATCH
defect_fields = diff set or []
decided_by    = llm            (the scorer's unscored cost diagnostic; this pipeline has no rules)
```

### 5.4 Escalation policy

| Reason | Trigger | Evidence attached |
|---|---|---|
| `unreadable` | doc-extract reports no text layer and OCR confidence below 0.5, or file fails to open, or 0 bytes | page PNGs, parser error |
| `wrong_doc_type` | fingerprint of the BL-role file is not BL | first 20 lines |
| `missing_attachment` | comparison requested and BL absent | body excerpt with the requesting sentence |
| `missing_value` | placeholder or null on a required field on either side after verification, including a value the extractor and its verifier could not locate | both raw values |

These four are the organisers' `review_reason` enum and the only values the column ever holds,
in `comparisons`, in `review_cases` and in the submission. The README's table is enforced by
check constraints: a reason is set exactly when the status is `NEEDS_REVIEW`, and `has_defect`
is true exactly when it is `MISMATCH`. A job that fails after its retries is not a review
reason: the email is `failed`, and its case is `kind = failure` with a null reason.

### 5.5 Review actions

| Action | Writes | Then |
|---|---|---|
| confirm | `review_actions(kind=confirm)`, case closed | stage `done` |
| correct field | `review_actions(kind=correct_field, field, old, new)`, `extraction_fields.human_value` | enqueue `compare` with `rerunFrom: compare` |
| reclassify | `review_actions(kind=reclassify)`, `classifications.human_category` | enqueue `classify`? No: set category directly, and enqueue `compare` if new category is `BL_COMPARISON` |
| add note | `review_actions(kind=note, text)` | none |
| upload attachment | object under `uploads/{caseId}/`, `attachments` row with `origin=human` | enqueue `compare` with `rerunFrom: triage` |
| retry | new job with `rerunFrom` = failed stage | case stays open until the rerun completes |

Human values win: normalise and compare read `human_value ?? value`.

## 6. doc-extract service

Python 3.12, FastAPI. Reads bytes from MinIO by key so large files never pass through Node.

| Route | Body | Returns |
|---|---|---|
| `GET /healthz` | | `{ ok, tesseract: version }` |
| `POST /extract` | `{ key, contentType? }` | see below |
| `POST /render` | `{ key, dpi: 110 }` | `{ pages: [{ key: "...pages/1.png", width, height }] }` |

`/extract` response:

```json
{
  "format": "pdf",
  "text": "full text, pages joined with \f",
  "pages": [{ "index": 1, "text": "...", "source": "text_layer" | "ocr", "ocr_confidence": 0.91 }],
  "tables": [{ "page": 1, "rows": [["Shipper", "..."]] }],
  "unreadable": false,
  "warnings": ["page 2 had no text layer, OCR used"]
}
```

Per format:

| Format | Library | Notes |
|---|---|---|
| `.txt` | stdlib, encoding sniff | |
| `.pdf` | PyMuPDF text with `sort=True`; tables via `page.find_tables()`; if a page yields under 20 characters, render at 220 dpi and run tesseract (`--psm 6`, `eng+chi_sim`) | garbled or unopenable → `unreadable: true` |
| `.docx` | python-docx paragraphs + tables flattened to `label: value` lines | bilingual labels kept as-is |
| `.xlsx` | openpyxl, every non-empty cell as `A1-style row text`, adjacent label/value pairs joined | |
| 0 bytes | | `unreadable: true` |

Extracted text is also written to MinIO under `.../text/{name}.txt` so re-runs skip parsing.

Vision path (*verify*): if the proxy accepts image content blocks, `compare.worker` sends the
rendered page PNGs to the extraction model when `ocr_confidence < 0.7`. If the proxy drops
images, OCR text is used and the reviewer sees the PNG.

## 7. LLM layer

- Client: existing `src/llm.ts` against `LLM_PROXY_URL/v1/messages` (Anthropic wire; the Anthropic SDK with `baseURL` set to the proxy).
- Structured output: `agents/structured.ts` sends the JSON schema in the system prompt, parses
  with zod, retries once with the validation error appended, then throws `TerminalError`.
- Prompt registry: `agents/prompts/<step>/<version>.md` with frontmatter
  `{ step, version, model_default, schema }`. Active version per step comes from
  `core.prompt_versions.active`. Every call stores `prompt_version`.
- Few-shot examples live in `agents/prompts/<step>/examples.json`, generated by
  `eval/split.ts` from the training split only.
- Timeouts: classify 60 s, extract 120 s, chat 240 s. Retries on 429/503 with jitter, inside
  the BullMQ attempt.
- Every call inserts `core.llm_calls` with step, model, prompt_version, request, response,
  input_tokens, output_tokens, cost_usd (from the proxy's usage block), latency_ms, email_run_id.
- Models: `sonnet` for every step (decided 2026-09-19). Values must be proxy aliases. Env vars allow swapping per role for experiments; Qwen aliases go in
  when the proxy is upgraded (see the Retina deploy README).

## 8. Postgres schema

Two schemas. `core` is normalised and written by the pipeline. `analytics` is derived.

### 8.1 `core`

```sql
runs               (id uuid pk, source text, rate_per_second numeric, status text,
                    ingest_epoch int default 0,   -- which ingest job owns the run; every resume raises it
                    prompt_set jsonb, started_at, finished_at, created_by text)
clients            (domain text pk, name text, tier smallint default 3, kind text check (kind in ('customer','internal','forwarder','spam')), updated_at)
emails             (email_id text pk, from_addr text, sender_domain text, subject text, body text,
                    tonnage_mt int, raw jsonb, first_seen_at)
email_runs         (id bigserial pk, run_id fk, email_id fk, stage text, priority int, attempt int,
                    outcome text, started_at, finished_at, unique(run_id, email_id))
attachments        (id bigserial pk, email_id fk, run_id fk, filename text, role text, origin text default 'source',
                    object_key text, content_type text, bytes int, sha256 text)
documents          (id bigserial pk, attachment_id fk, email_run_id fk, doc_type text, format text,
                    text_object_key text, unreadable bool, parse_warnings jsonb, pages int)
classifications    (id bigserial pk, email_run_id fk unique,
                    gen_category text, gen_confidence numeric, ver_category text, ver_confidence numeric,
                    final_category text, human_category text, decided_by text, rationale jsonb, prompt_version text)
extractions        (id bigserial pk, document_id fk, email_run_id fk, prompt_version text, verified bool, created_at)
extraction_fields  (id bigserial pk, extraction_id fk, field text, value text, normalised text,
                    source_quote text, confidence numeric, evidence_ok bool, human_value text, note text,
                    unique(extraction_id, field))
comparisons        (id bigserial pk, email_run_id fk unique, status text, review_reason text,
                    has_defect bool, decided_by text, created_at)
field_diffs        (id bigserial pk, comparison_id fk, field text, si_value text, bl_value text,
                    si_normalised text, bl_normalised text, judge_used bool, judge_confidence numeric)
review_cases       (id bigserial pk, email_run_id fk, reason text, detail jsonb, stage text,
                    status text check (status in ('open','resolved')), opened_at, resolved_at, resolved_by text)
review_actions     (id bigserial pk, review_case_id fk, kind text, field text, old_value text, new_value text,
                    note text, actor text, created_at)
llm_calls          (id bigserial pk, email_run_id fk null, step text, model text, prompt_version text,
                    request jsonb, response jsonb, input_tokens int, output_tokens int, cost_usd numeric,
                    latency_ms int, ok bool, error text, created_at)
prompt_versions    (step text, version text, active bool, notes text, created_at, primary key(step, version))
submissions        (id bigserial pk, run_id fk, payload jsonb, scoreboard jsonb, final_score numeric, created_at)
lessons            (id bigserial pk, step text, text text, source_review_action_id fk, status text
                    check (status in ('candidate','approved','rejected','shipped','rolled_back')),
                    eval_before numeric, eval_after numeric, approved_by text, created_at)
chat_conversations (id uuid pk, title text, created_by text, created_at)
chat_turns         (id bigserial pk, conversation_id fk, role text, content text, tool_calls jsonb, created_at)
```

Shipment-level entities (`shipments`, `parties`, `ports`, `carriers`) are populated from
verified extractions in a later phase; the columns above are enough for scoring, review, and
explainability. Indexes: `email_runs(run_id, stage)`, `review_cases(status)`,
`llm_calls(email_run_id)`, `emails(sender_domain)`.

### 8.2 `analytics`

Materialised views refreshed by a repeatable job every 5 minutes (and on demand after a run
finishes):

| View | Grain | Columns |
|---|---|---|
| `fact_email_outcome` | one row per email_run | run_id, email_id, sender_domain, client_tier, category, decided_by, status, review_reason, has_defect, n_defects, llm_calls, llm_cost_usd, latency_ms |
| `fact_field_diff` | one row per field diff | run_id, email_id, sender_domain, field, si_value, bl_value |
| `dim_client` | one row per domain | domain, name, tier, kind |
| `dim_run` | one row per run | id, started_at, prompt_set, final_score |
| `agg_client_run` | client × run | emails, comparisons, mismatches, reviews, top_defect_field |
| `agg_run_stage` | run | counts per stage, throughput per minute, verifier_share, cost |

### 8.3 Roles

```sql
create role retina_ro login password '...';
grant usage on schema core, analytics to retina_ro;
grant select on all tables in schema core, analytics to retina_ro;
alter role retina_ro set statement_timeout = '5s';
alter role retina_ro set default_transaction_read_only = on;
```

The chat agent's pool uses `DATABASE_RO_URL`. `llm_calls.request` is excluded from the grant
(column-level) so prompts with document text do not leak through free-form SQL; the
`explain_decision` tool reads them through the read-write pool with a fixed query instead.

## 9. MinIO layout

Bucket `retina`, private. Keys:

```
runs/{runId}/emails/{emailId}/attachments/{filename}        raw, as received
runs/{runId}/emails/{emailId}/text/{filename}.txt            extracted text
runs/{runId}/emails/{emailId}/pages/{filename}/{n}.png       rendered pages (pdf only, on demand)
uploads/{reviewCaseId}/{filename}                            reviewer uploads
submissions/{runId}/{timestamp}.json                         what was sent to the scorer
```

Attachments are identical across runs; the first run stores them and later runs store a row
pointing at the same `sha256` object under `blobs/{sha256}` with the run key as an alias. Keep
it simple in phase 1 (copy per run) and dedupe later if disk matters.

The frontend never receives MinIO credentials. `GET /files/*key` on the api checks the bearer,
streams the object (or redirects to a 5-minute presigned URL when MinIO is reachable from the
browser, which it is not through ngrok, so streaming is the default).

## 10. API routes

All under bearer auth except `/health`. Existing `/ai/*` routes remain.

| Method, path | Purpose |
|---|---|
| `GET /health` | `{ status: ok \| degraded, checks: { postgres, redis, minio, inbox } }`, 2 s per check. Degraded is still 200; only postgres down is 503, which is the signal auto-deploy rolls back on. The proxy is left out on purpose: a cold model would read as an outage. doc-extract joins in phase 5 |
| `POST /runs` | start a run `{ source, ratePerSecond, limit?, emailIds?, promptSet? }` |
| `GET /runs`, `GET /runs/:id` | list, detail with stage counts, queue depth, cost, score. `queues` is `null` when Redis cannot be reached; the rest comes from Postgres and is still served |
| `POST /runs/:id/pause`, `/resume`, `/cancel` | control the replay |
| `POST /runs/:id/submit` | build submission, post to averis, store scoreboard |
| `GET /runs/:id/submission.json` | download the payload |
| `GET /runs/:id/emails?stage=&category=&status=&q=` | paginated list |
| `GET /emails/:runId/:emailId` | full trace: email, attachments, classification, extractions with fields, comparison, diffs, review case, llm_calls summary |
| `GET /review?status=open` | review inbox |
| `POST /review/:id/actions` | `{ kind, field?, value?, note? }` |
| `POST /review/:id/upload` | multipart attachment |
| `GET /queues` | waiting/active/failed per queue |
| `GET /clients`, `PUT /clients/:domain` | tiers |
| `POST /chat/conversations`, `POST /chat/:id/messages`, `GET /chat/:id` | chat agent |
| `GET /eval/runs/:id` | holdout and full-set score computed locally (dev only; returns 404 on the VPS where ground truth is absent) |
| `GET /lessons`, `POST /lessons/:id/approve|reject` | gated self-improvement |
| `GET /files/*key` | stream object |

Contract types live in `backend/src/contracts.ts` and are copied into
`frontend/lib/api-client.ts`, as the template already does for `/ai/chat`.

## 11. Chat agent

`agents/chat/loop.ts`: a plain tool-use loop over the proxy, max 8 tool calls per turn.

System prompt contains: the `analytics` view definitions with one-line column descriptions, the
`core` table list, the five categories and seven fields, examples of good queries, and the rule
"always show the SQL you ran".

Tools:

| Tool | Input | Guardrails |
|---|---|---|
| `describe_schema` | `{ schema?: "core" \| "analytics", table? }` | reads `information_schema` through the RO pool |
| `run_sql` | `{ sql }` | must start with `select` or `with`; one statement; no `;` inside; `LIMIT 200` appended if absent; RO role with 5 s timeout; result truncated to 200 rows and 20 kB |
| `get_email` | `{ runId?, emailId }` | fixed query, returns the trace summary |
| `explain_decision` | `{ runId, emailId }` | fixed queries over classifications, extraction_fields, field_diffs, review_actions, and the rationales in `llm_calls.response`; returns a structured timeline the model narrates |

Turns and tool calls are stored in `chat_turns`. Later, the same four tools are exposed by a
small MCP server (`backend/src/mcp.ts`, stdio) so Claude Code and teammates can use them; the
tool implementations are shared modules, not duplicated.

## 12. Eval harness

- `pnpm eval:split`: reads `ground_truth.json` (local path from `EVAL_GROUND_TRUTH_PATH`),
  stratifies by `(category, review_reason)`, writes `eval/split.json` with `train` and `holdout`
  id lists. Committed once and never regenerated unless the dataset changes.
- `pnpm eval:examples`: builds `examples.json` per step from the `train` split.
- `pnpm eval:score --run <id> [--holdout]`: builds the submission for the run from Postgres,
  scores it with `eval/score.ts` (port of `scoring.py`: stage1 macro-F1, stage3 defect-F1,
  end-to-end with exact set equality, reliability diagnostics), prints the scoreboard and a
  confusion matrix, writes `eval/reports/<run>.json`.
- `pnpm eval:diff --a <run> --b <run>`: emails whose outcome changed between two runs, for
  prompt comparison.
- The lesson gate calls `eval:score --holdout` before and after applying a candidate; a drop
  in `final_score` or in any single component blocks it.

On the VPS, `ground_truth.json` exists only inside the averis container's `/secrets` mount.
`api` and `worker` cannot read it, so `/eval/*` routes are disabled there and scoring goes
through `POST /submit`.

## 13. Frontend

Pages (all behind `middleware.ts` password gate; cookie signed with `SESSION_SECRET`):

| Route | Content | Polling |
|---|---|---|
| `/login` | password form | |
| `/runs` | table of runs with score, start-run form (rate, limit) | 5 s |
| `/runs/[id]` | stage funnel, queue depth, category mix, verifier share, cost, live email feed, submit button, score card | 2 s |
| `/emails/[runId]/[emailId]` | trace: email, attachments with viewer, classification panel (generator, verifier), extraction table with quotes highlighted in the document text, comparison table, review panel | on demand |
| `/review` | open cases grouped by reason, plus Failures tab; case detail with actions and upload | 3 s |
| `/chat` | conversations, messages, SQL shown in a collapsible block, result tables | on send |
| `/eval` | score history per run and prompt set; dev-only holdout view | 10 s |
| `/clients` | tier editor | |

`lib/api-client.ts` stays the only door to the backend. Server actions and route handlers call
it; client components never hold the secret. Polling uses SWR with `refreshInterval`.

## 14. Deployment changes

- `deploy/compose.yaml`: add redis, minio, minio-init, worker, doc-extract, averis.
- `auto-deploy.sh`: after pulling or building the api image, also `docker compose build
  doc-extract` and `docker compose up -d api worker doc-extract`; health poll covers
  `/health` including the new dependency checks; rollback restores both api and worker images.
- Averis: copy the organiser kit into `emails/` with `ground_truth.json` excluded from
  git (`.gitignore`) and placed on the box by hand at `~/retina/secrets/ground_truth.json`,
  mounted only into the averis service.
- GitHub Actions: type-check `services/doc-extract` with `ruff` and run its unit tests;
  publish the api image as today.
- Cron on the box stays as it is (ngrok `@reboot`, auto-deploy every 3 minutes). Scheduled
  application work (priority cache, analytics refresh, aging) runs as BullMQ repeatable jobs
  inside the worker, not as system cron, so it deploys with the code.
- Backups: `pg_dump` nightly to `~/retina/backups/` via one cron line; MinIO data volume is on
  the same disk, `mc mirror` optional.

## 15. Security

- Two bearer keys unchanged. The frontend key never reaches the browser.
- Password gate on every frontend route except `/login`.
- `retina_ro` role for anything that executes model-written SQL; statement timeout; column
  grant excludes raw prompts.
- No public ports except `127.0.0.1:8091` (api) and `127.0.0.1:8080` (averis, for box-local
  curl only). MinIO console reachable only through an SSH tunnel.
- Uploaded files: size cap 20 MB, extension allow-list, stored under a case-scoped key, parsed
  by doc-extract in the same sandbox as everything else.
- Secrets in `~/retina/.env`, never in the repo. Ground truth never in the repo.

## 16. Observability

- Structured JSON logs (pino) with `runId`, `emailId`, `stage`, `jobId` on every line.
- `core.llm_calls` is the LLM ledger: cost per run, per step, per prompt version, latency p50/p95.
- `GET /queues` and `run:{id}:counters` feed the dashboard; `docker compose logs -f worker`
  for the live view.
- `/health` returns per-dependency status and the worker heartbeat (worker writes
  `worker:heartbeat` to Redis every 10 s; api reports stale after 60 s).
- Proxy spend by project at `172.17.0.1:4000/admin/usage`; set `X-Project: retina-worker`
  and `retina-chat` headers so it is split.

## 17. Failure modes

| Failure | Effect | Handling |
|---|---|---|
| llm-proxy down | classify and compare jobs fail with 503 | retryable; after 3 attempts the email is `failed` and shows under Failures; dashboard shows proxy red in `/health` |
| Claude login expired on the box | `subscription*` calls fail, `test` works | runbook: run `claude` interactively as student |
| doc-extract OOM on a big PDF | job fails | retryable; memory limit 1 GB; file size cap |
| Redis restart | in-flight jobs stall | AOF restores the queue; stalled jobs re-run; job ids prevent duplicates |
| Worker crash mid-job | lock expires | BullMQ marks stalled, retries |
| ngrok agent dies | frontend "Backend unreachable"; pipeline unaffected | `@reboot` cron; manual restart from the runbook |
| Vercel action exceeds 300 s | never, by design | all long work is queued |
| Averis container restarted | ingest tick fails | retryable; replay resumes from the last ingested email |
| Duplicate run of the same inbox | separate run id, separate rows | intended; attachments copied again (dedupe later) |

## 18. Verify on day one

1. Proxy accepts image content blocks? Determines whether vision is available for scans.
2. Proxy tolerates 8 concurrent requests without queueing errors.
3. What the plain `subscription` alias maps to, and per-minute limits on the subscription.
4. Averis container serves attachments correctly from inside the compose network.
5. `tesseract` with `chi_sim` installed in the doc-extract image; OCR quality on the 5 scans.
6. `job.changePriority` behaves as expected on the installed BullMQ version.
7. Disk headroom on the box for MinIO plus page renders (estimate under 1 GB for 520 emails).
