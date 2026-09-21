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
      chat/                loop.ts, CHAT.md, orientation.ts, grounding.ts, inject.ts, skills/<name>/{SKILL.md,recipes/*.sql}, tools/
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
  proxy.ts                 password gate
```

## 2. Compose services (VPS)

`deploy/compose.yaml`, all on one private network `retina`. Only `api` publishes a port.

| Service | Image | Ports | Volumes | Notes |
|---|---|---|---|---|
| postgres | postgres:17 | none | pgdata | healthcheck `pg_isready` |
| redis | redis:7 | none | redisdata | `command: redis-server --appendonly yes --maxmemory-policy noeviction --maxmemory 512mb` |
| minio | quay.io/minio/minio (`minio/minio` is gone from Docker Hub) | none (console reachable via `docker compose exec` or an SSH tunnel) | miniodata | `server /data --console-address :9001`; init job creates bucket `retina` |
| minio-init | same minio image | none | none | one-shot: creates bucket `retina`, then exits 0 |
| api | ghcr.io/noobmaster169/retina-api:main | `127.0.0.1:8091:8091` | none | runs migrations then listens; depends on postgres, redis, minio healthy |
| worker | same image | none | none | `command: node --import tsx src/worker.ts` (no build step; the image runs TypeScript through tsx); `depends_on: api, llm-proxy: service_started`, not `service_healthy`: an unhealthy api must not also take the worker down, and waiting on it aborted a deploy |
| llm-proxy | built from `proxy/` in the clone (Python, plus the Claude Code CLI pinned by `CLAUDE_CODE_VERSION`) | none (private to the network) | none | `http://llm-proxy:4000` inside the network. Logged in by `CLAUDE_CODE_OAUTH_TOKEN` from `.env`, optional so the stack comes up without it; a call without a login is `provider_not_logged_in`, never retried. `auto-deploy.sh` rebuilds it when `proxy/` changes |
| doc-extract | built from `services/doc-extract` in the clone (Python on uv, tesseract with `eng` and `chi_sim`) | none (private to the network) | none | `http://doc-extract:8000`; healthcheck `/healthz`; 1 GB memory limit. `auto-deploy.sh` rebuilds it when `services/doc-extract/` changes |
| inbox | built from `emails/server` in the clone | none (private to the network) | `emails/data_v2:/data:ro`, `emails/data_v2/ground_truth.json:/secrets/ground_truth.json:ro` | organiser image, unchanged code |

The organiser kit is kept in the same compose file, as the service `inbox`, so `api` and
`worker` reach it as `http://inbox:8000`. It publishes no port: `POST /submit` is called from
inside the network.
The answer key volume is attached to `inbox` only. `api` and `worker` never mount it.

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
| `DOC_EXTRACT_URL` | `http://doc-extract:8000` in compose; `http://127.0.0.1:8000` from the host with `compose.local.yaml` | worker (parse), api (/health) |
| `EMAIL_SERVER_URL` | `http://inbox:8000` (already set in `deploy/compose.yaml`) | api, worker |
| `LLM_PROXY_URL` | `http://llm-proxy:4000` in compose; `http://127.0.0.1:4001` from the host with `compose.local.yaml`. A remote `/ai/chat` is refused at boot | api, worker |
| `CLAUDE_CODE_OAUTH_TOKEN` | from `claude setup-token`; read by compose into the llm-proxy container only | llm-proxy |
| `LLM_MODEL_CLASSIFY`, `LLM_MODEL_VERIFY`, `LLM_MODEL_TRIAGE`, `LLM_MODEL_DOC_TYPE`, and one per phase 10f step (`LLM_MODEL_SHIPMENT_READ`, `LLM_MODEL_ENTITY_RESOLVE`, `LLM_MODEL_ENTITY_PROFILE`, `LLM_MODEL_CONCEPT_DEFINE`, `LLM_MODEL_CONCEPT_JUDGE`) | unset: every step runs the model its prompt file names, sonnet. An override must be a proxy alias from `proxy/proxy.yaml` | worker, api |
| `LLM_MAX_CONCURRENCY` | follows `CLASSIFY_CONCURRENCY` when unset, so one number sets how parallel every run is. Model calls in flight per worker process | worker (in-process semaphore) |
| `ONTOLOGY_KNOWLEDGE` | `mail+model` (the default) or `mail`. Whether an entity profile carries a `general` section from the model's own knowledge, labelled unverified. A person never gets one under either setting | worker |
| `JUDGE_BUDGET`, `JUDGE_BATCH`, `CANDIDATE_CAP`, `PROFILE_BATCH`, `PROFILE_FLOOR_HOURS` | `400`, `40`, `5000`, `50`, `24`. Starting values; `pnpm eval:chat --set ontology` is what says whether moving one helped | api (find_entities), worker |
| `SHIPMENT_TEXT_CHARS` | `14000`. How much of an email and its documents the shipment reader sees. A cost guard, not a judgement | worker |
| `ONTOLOGY_CONCURRENCY` | `2`. Left out of `LLM_MAX_CONCURRENCY`'s sum on purpose: its jobs take the same model slots and so wait behind scored work | worker |
| `CLASSIFY_CONCURRENCY`, `COMPARE_CONCURRENCY` | `2`, `4`. Classify is 2 because the `claudecli` provider serves two calls at a time; more workers only queue inside the proxy with their request timeout already running | worker |
| `API_SHARED_SECRET`, `TEAM_API_KEY` | hex | api |
| `SITE_PASSWORD` | string | frontend gate in `proxy.ts` (Vercel env) |
| `EVAL_GROUND_TRUTH_PATH` | local path only, unset on the VPS containers | eval CLI |

Frontend (Vercel): `BACKEND_URL`, `API_SHARED_SECRET`, `SITE_PASSWORD`. There is no separate
session secret: `lib/site-gate.ts` derives the cookie as an HMAC of `SITE_PASSWORD`, so changing
the password signs everyone out.

## 4. Queues

### 4.1 Redis key usage

| Key | Type | Purpose |
|---|---|---|
| `bull:classify:*`, `bull:compare:*`, `bull:scheduler:*` | BullMQ | the two email queues and the clock |
| `bull:ontology:*` | BullMQ | phase 10f's semantic reading, one job per email, below every scored job |
| `client:priority` | hash `domain -> tier(1..5)` | enqueue-time priority lookup, refreshed hourly and written through on every `PUT /clients/:domain` |
| `live:call:*` | string, 900 s TTL | one model call in flight, for the run page's preview |
| `worker:heartbeat` | string, 60 s TTL | worker liveness for `/health` |

`run:{runId}:counters` was planned and never built: phase 7's dashboard reads its counters from
Postgres, which is one query and cannot drift from the rows it counts. Nothing writes the key,
so nothing expires it either.

### 4.2 Queue definitions

| Queue | Job name | Payload | Producer | Consumer |
|---|---|---|---|---|
| `classify` | `classify-email` | `{ runId, emailId }` | replay controller, review "reclassify" | classify.worker |
| `compare` | `compare-email` | `{ runId, emailId }` today; phase 8 adds `rerunFrom?: "triage" \| "extract" \| "compare"` when something reads it | classify.worker, review actions | compare.worker |
| `ontology` | `read-shipment` | `{ emailId, emailRunId }` | the compare worker, once the email reaches `done` or `review` | ontology.worker, `ONTOLOGY_CONCURRENCY` |
| `scheduler` | the task's own name | none; the name is the job | `queues/schedulers.ts` at worker boot | the scheduler worker, concurrency 1 |

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

The `ontology` queue's options differ in two ways, and both follow from its job id being the
email id rather than `runId__emailId`: `priority` is a flat 2000, below the 1000 an email job can
ever reach, and `removeOnComplete` is `true` rather than an age. A finished job kept for a day
would hold that id, and the re-reading a reviewer's correction asks for would be silently
refused. A failure is kept an hour, which is long enough to read and short enough not to block the
correction that fixes it.

Worker options: `concurrency` from env, `lockDuration: 120000` (LLM calls can be slow),
`stalledInterval: 30000`, `maxStalledCount: 10`. A job that stalls (worker died) is retried
automatically. The count is 10, not BullMQ's default of 1, because every worker restart that
catches a job mid-call stalls it once and a deploy is a restart: with the default, two restarts
would fail an email that did nothing wrong. Past the count BullMQ fails the job with "job stalled
more than allowable limit" and never retries it, which the worker treats as final.

### 4.3 Priority

BullMQ: lower number = served first. Range used: 1 to 1000.

```
tier        = redis HGET client:priority <sender domain>   (default 3)
tonnage     = integer parsed from subject, e.g. "__138MT" -> 138 (default 0)
tonnageBonus= min(floor(tonnage / 10), 99)
priority    = tier * 200 - tonnageBonus          // tier 1 & 500 MT -> 150; tier 5 & 0 MT -> 1000
```

The bonus caps at 99 so it can never cross the 200 between two tiers: without the cap a large
shipment from a tier-3 forwarder would overtake a tier-1 client, and the tier would stop meaning
what `/clients` says it means. Never 0: BullMQ reads 0 as "no explicit priority" and serves those
**ahead** of every prioritised job.

The number is stored on `core.email_runs.priority` and read back wherever a job is added again,
rather than recomputed. A rerun a person asked for therefore keeps the tier the email already
had, instead of joining a burst at a default because the cache changed in between. The classify
processor forwards `job.opts.priority` to the compare job for the same reason.

Aging: a repeatable job every 60 s lists `waiting` and `prioritized` jobs older than 5 minutes
and calls `job.changePriority({ priority: max(1, current - 100) })`. It promotes, so a rerun is
not exempt. `changePriority` updates `job.priority` and leaves `job.opts.priority` at whatever
the job was added with, so a pass that reads the options recomputes the same first step forever.

Client tiers come from `core.clients` (manual `tier` column, seeded with the domains the
organisers' kit names, and only those). A repeatable job every hour writes the table into the
`client:priority` hash, and `PUT /clients/:domain` writes Postgres then the hash. Postgres first:
a cache holding a tier no row backs would survive a restart and order the queue by a number
nobody can see.

### 4.4 LLM concurrency cap

An in-process semaphore of size `LLM_MAX_CONCURRENCY` (`agents/llm-slot.ts`) wraps every proxy
call the worker makes. A retry waits outside the slot. One process, one cap; no Redis
coordination is needed while there is one worker replica. The api's chat is not capped by it.

Unset, it is `CLASSIFY_CONCURRENCY + COMPARE_CONCURRENCY`, because that is how many jobs BullMQ
runs at once and all of them contend for these slots. It used to be `CLASSIFY_CONCURRENCY` alone:
eight classify jobs could hold every slot while four compare jobs sat blocked in the semaphore,
which the run page drew as sorting unaffected and checking paused, with nothing saying why.
`proxy.yaml`'s `max_concurrency` is 12 to match. Both sit well under the measured ceilings: the
`claudecli` provider serves about 0.5 requests a second, and ngrok falls over above roughly 64
sockets.

The semaphore reports `peak()`, the most calls it ever had in flight, and logs it whenever it
rises. `scripts/load-test.ts` computes the same number independently by sweeping `llm_calls`
start and end times, because a semaphore cannot report a violation of its own cap.

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
- A model outage is not the email's fault. `LlmUnavailableError` (a `RetryableError`: the proxy
  answered 429 or 5xx, or could not be reached) does not spend an attempt. `queues/failure-policy.ts`
  calls `classify.rateLimit(30_000)` and throws BullMQ's `Worker.RateLimitError()`, which returns
  the job to waiting and stops every worker taking classify jobs for 30 s. Without it a short
  outage burns all three attempts of every in-flight email within seconds and fails them for good.
  BullMQ honours a manual rate limit only on a worker that has a `limiter`, so the classify worker
  carries one of 10000 per second that is never reached.

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
Nothing is stripped, reordered or normalised. A prompt whose frontmatter says
`reads_attachments: true` (`classify/v5.md`, `classify-verify/v2.md`) also gets an
"attachment contents" section (`classify/attachments.ts`): each file's name and the text
doc-extract recovered, cut at `CLASSIFY_ATTACHMENT_CHARS`, an unreadable file named with the
parser's reason. The input shape follows the pinned prompt, so `v3` runs exactly as before.

**Generator** (`prompts/classify/v3.md`, the active version; v1 and v2 are kept for comparison). Defines the five categories in the organisers' words
(the brief and `emails/data_v2/README.md`), says that a body may carry a forwarded thread, a
signature and a warning banner and that the category follows what the sender is asking for now.
It names no sender, domain, subject code or phrase from the dataset. Zero-shot. `v4` is `v3` plus
ten train examples and is not active: it ships only if a holdout run shows it helps. Output (JSON
schema enforced, category restricted to the enum, rationale first because a schema-bound answer
has no room for reasoning before it):

```json
{ "rationale": "The sender asks for the draft BL to be checked against the SI; two attachments are named as an SI and a BL.", "category": "BL_COMPARISON", "confidence": 0.93 }
```

**Verifier trigger** (`pipeline/classify/decide.ts`): `gen.confidence < VERIFY_BELOW`, `0.9`, chosen
on the train split (24 of 401 train emails below it under v2; every recorded miss at 0.70 or
lower). The model's own confidence is the only input; there is no branch on email content.

**Verifier** (`prompts/classify-verify/v1.md`) receives the same input plus the generator's
proposal and is told to make the strongest case for every other category before deciding. The
case comes first in the schema, for the same reason as the generator's rationale. Output:

```json
{ "counter_cases": "...", "rationale": "...", "category": "GENERAL", "agrees": false, "confidence": 0.88 }
```

**Decision**: the verifier's category if it ran, else the generator's. `classifications.decided_by`
is `llm`, `verifier` or `human`. The submission's `decided_by` is always `llm`.

**A second pass over the same email costs nothing and undoes nothing.** The processor reads the
stored classification first and skips the model call when one is already there, so a retry, a
stalled job reclaimed while its first copy finishes, or a rerun of the stage does not pay for the
email twice. Every stage move names the stages it may start from (`emailRuns.moveStage`), so a
late second pass cannot drag an email that compare already finished back to `classified`. A run
cancelled while the model call is in flight is honoured: the status is read again after the call
returns, before anything is written. No lock table and no Redis lock is needed for either.

`ver_category` and `ver_confidence` hold the verifier's answer when it ran, and `rationale` holds
`{ generator, verifier?, counterCases? }`. `human_category` and `decided_by = human` stay empty
until human review (phase 8).

### 5.3 Compare

**Parse** (`queues/processors/parse-documents.ts`): every attachment goes through doc-extract
(section 6) once. The text lands in MinIO under `text/`, and a `documents` row keeps the format,
page count, whether OCR was used, whether the file was unreadable, the parser's warnings, and
`page_confidence`: the mean OCR word confidence of each page in page order, empty for a document
with a text layer. The per page numbers are what the email page's review case shows, because one
number for a whole file cannot say which page failed (migration `007`).
Idempotent: a classify prompt that reads attachments (`reads_attachments: true` in its
frontmatter, `classify/v5.md`) parses first, and compare finds the rows.

**Document type** (`prompts/doc-type/v1.md`, one call per readable document). The model reads
the extracted text and answers `{ rationale, doc_type: "SI" | "BL" | "INVOICE" | "PACKING_LIST"
| "COO" | "OTHER", confidence }`, stored on the `documents` row. There is no title table or label
list in code: what a Commercial Invoice looks like is the model's knowledge, not a pattern read
off this dataset. The filename's role is passed in as a claim to check, never trusted. A document
already typed is not asked about again.

**Triage** (`prompts/triage/v1.md`, only for an email with nothing attached). The model reads the
email and answers `{ rationale, request: "send_draft" | "compare_documents", confidence }`: the
organisers' distinction between a request for the draft BL (nothing to compare yet, `OK`) and a
comparison whose documents did not arrive (`missing_attachment`). No verb list or regex over
the body, for the same reason there are no classification rules.

**Structure** (`pipeline/compare/structure.ts`, pure, table-driven tested). Given the typed
documents and the triage answer, in this order: any document unreadable → `unreadable`; any
document read by OCR → `unreadable` with `scanned: true` and `provisional: null` (a scan is
escalated, never silently trusted; phase 6 fills the provisional comparison); then
`compare/triage.ts` resolves roles (the filename's claim first, the model's word for a file that
claims nothing, a crossed pair swapped and the swap reported as `swapped`); then any document
**filling the SI or BL place** that the model confidently says is neither → `wrong_doc_type`;
then `compare`, `awaiting_draft` or `missing_attachment`. Which files are present is a fact code
decides on; what an email with none asks for is the model's reading.

Two limits on that middle step. A file that fills no place in the pair is an extra, and its kind
is not this check's business: an invoice travels with shipping paperwork all the time, and
`extras` carries it. And a reading below `DOC_TYPE_TRUST_FROM` (0.7) does not displace the file
name's claim, because parking an email costs a person either way and a reading the model itself
is unsure of is not enough to do it. `documentVerdicts` in the same module gives each document
its verdict (`unknown`, `ok`, `crossed`, `wrong_type`) from that one reading, and the trace route
puts it on `DocumentView.typeVerdict`, so a page shows the stage's verdict instead of making a
second rule of its own.

`escalate.ts` opens one review case per email run, writes the comparison row as
`NEEDS_REVIEW` with the reason, and parks the email at `review` with `outcome = reason`. An email
at `review` counts as finished for the run. A comparable pair goes on to the field check below
(`queues/processors/compare-pair.ts`); its comparison detail carries `si`, `bl`, `extras` and
`swapped` beside the decision. A scanned pair is compared on its OCR text and then escalated
`unreadable` with the decision as `detail.provisional` for the reviewer; a comparison that fails
for good on garbled text leaves `provisional: null` and never changes that verdict. On every
path the comparison row and its `field_diffs` are written before the email moves stage, so a
retry after a failed write finds them missing and writes them again.

**Extract** (`prompts/extract/v1.md`, `agents/extract.ts`), one call per document. Input: which
document it is (SI or BL), the file format, and the full text (OCR text for a scan; images never
reach the model, see section 6). The prompt defines the seven fields in the domain's terms, says
labels differ between the two documents and may carry a second language in brackets, and asks
for every value verbatim with the exact line it came from. There is no label table in code.
Output, per field:

```json
{
  "shipper":           { "value": "APRIL FINE PAPER TRADING PTE LTD", "placeholder": null, "source_quote": "Shipper: APRIL FINE PAPER TRADING PTE LTD", "confidence": 0.98, "note": null },
  "notify_party":      { "value": null, "placeholder": null, "source_quote": null, "confidence": 0.9, "note": "no notify party in the document" },
  "gross_weight_kg":   { "value": null, "placeholder": "???", "source_quote": "Gross Weight毛重(KGS): ???", "confidence": 0.95, "note": null },
  "port_of_loading":   { "value": "NANTONG, CHINA (CNNTG)", "placeholder": null, "source_quote": "POL: NANTONG, CHINA (CNNTG)", "confidence": 0.97, "note": null }
}
```

Values are returned raw and stay raw: nothing in code reformats, converts or normalises them.
Whether two raw values denote the same thing is the field judge's question below.

**Evidence check** (`compare/evidence.ts`, pure): for each field, `source_quote` must appear in
the document text and `value` inside the quote, both sides whitespace-collapsed and case-folded.
A placeholder needs only its line found; a field the extractor says the document does not carry
has nothing to prove. `fieldsInDoubt` lists every field whose evidence fails or whose confidence
is under `EXTRACT_TRUST_FROM` (0.7); if any, the extraction verifier
(`prompts/extract-verify/v1.md`) reads that document again with the first answer and the doubts
in front of it and returns all seven. A field still failing evidence after that becomes
`value: null` with the note that the verifier could not locate it: a value that cannot be found is
uncertainty, and so a `missing_value`. A verifier whose answer never fits its schema degrades the
same way for the fields it was asked about; an outage pauses the queue. `extractions.verified`
records whether it ran, and every field's `evidence_ok` is stored.

The extraction is one call per document (`prompts/extract/v1.md`, `queues/processors/extract-fields.ts`),
keyed on the `extractions` row by document: a job that runs twice reads its extractions back
under the run's prompt version instead of paying for them again, with `human_value` in place of
the model's value where a person set one.

**Field judge** (`prompts/field-judge/v1.md`, `agents/field-judge.ts`), one call per pair. The
model receives, one section per field, the SI value and the BL value with the line each was
quoted from, and answers for each `{ rationale, same: boolean, missing: boolean, confidence }`.
`same` means the two values denote the same thing in a shipping document: a weight with and
without its thousands separator or unit, a port with and without a code beside it, a company
name with its legal form spelt differently. `missing` means one value is blank, a placeholder or
a note that nothing was found, which is uncertainty and never a difference. The prompt states
those principles in the organisers' terms; it lists no normalisation rules and no values from
the dataset. The schema is built per call from exactly the fields asked about, so the model can
neither skip one nor answer for one it was not given. Only fields with a value on both sides are
asked about (`judgeable`): a side the extractor found nothing on is missing by the extractor's
own word, and there is nothing to compare.

There are no normalisers in code: no unit tables, no suffix lists, no code stripping. Code does
one thing (`compare/assemble.ts`, pure): one `FieldJudgement` per field in the enum's order, the
fields judged `same: false` and not missing as `defectFields`, the fields missing on either side
as `missing`, and every name validated against the `ComparisonField` enum, a name outside it a
`TerminalError`. That keeps the submitted set exact without the model ever writing the final
list free-hand. The judge always decides; an unsure judgement is not an escalation, and its
confidence is stored for the reviewer. All seven judgements land in `field_diffs`, on a
`missing_value` escalation and on a scan's provisional result too, so the trace shows the whole
pair whatever the verdict.

**Decide** (`compare/decide.ts`):

```
unreadable, wrong_doc_type, missing_attachment  -> NEEDS_REVIEW, decided by checkStructure before any field is read
else if any field missing                       -> NEEDS_REVIEW missing_value (defect fields carried as provisional)
else if no field judged different               -> OK
else                                            -> MISMATCH, defect_fields = the fields judged different
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
| `unreadable` | doc-extract reports the file empty, unopenable, or without text even after OCR; or any page was read by OCR (`scanned: true`) | the files with the parser's warnings, page PNGs under `pages/` |
| `wrong_doc_type` | the doc-type model says, at `DOC_TYPE_TRUST_FROM` (0.7) or above, that a file filling the SI or BL place is an invoice, packing list, certificate of origin or other. An extra beside a good pair never raises it | the file, the role it claimed, the model's type, confidence and rationale |
| `missing_attachment` | no SI or no BL among the attachments; or nothing attached and the triage model reads a comparison request | which roles are missing, what arrived |
| `missing_value` | placeholder or null on a required field on either side after verification, including a value the extractor and its verifier could not locate | both raw values |

These four are the organisers' `review_reason` enum and the only values the column ever holds,
in `comparisons`, in `review_cases` and in the submission. The README's table is enforced by
check constraints: a reason is set exactly when the status is `NEEDS_REVIEW`, and `has_defect`
is true exactly when it is `MISMATCH`. A job that fails after its retries is not a review
reason: the email is `failed`, and its case is `kind = failure` with a null reason.

### 5.5 Review actions

Built in phase 8. Every action is one transaction, then the rerun it asks for, then the case read
back. The action row is written in the same transaction as what it describes, because it is the
record of what a person said and phase 11 drafts lessons from it; the rerun is enqueued only after
that commits, so a job never names a row nobody wrote.

| Action | Body | Writes | Then |
|---|---|---|---|
| `confirm` | `{ note? }` | action row; case resolved; `comparisons.decided_by = 'human'` | stage `done`. The reported status stays `NEEDS_REVIEW` with its reason: confirming records that a person agreed the email needs one |
| `correct_field` | `{ field, side, value, note? }` | action row with old and new; `extraction_fields.human_value` for that role and field | enqueue `compare` with `rerunFrom: "compare"`. The case stays open; the rerun settles it |
| `reclassify` | `{ category, note? }` | action row; `classifications.human_category`, `decided_by = 'human'` | `BL_COMPARISON`: enqueue `compare` (`rerunFrom: "triage"`). Otherwise `comparisons` upsert `OK` with `detail.reclassified`, `field_diffs` cleared, stage `done` with outcome `not_comparable`, case resolved |
| `note` | `{ note }` | action row | none |
| `upload` | multipart `file`, `role`, `note?` | object under `uploads/{caseId}/{filename}`; `attachments` row with `origin = 'human'`, `role`, `review_case_id`; the replaced file's `documents` row dropped so the new bytes are parsed; action row | enqueue `compare` with `rerunFrom: "triage"` |
| `retry` | `{ note? }` | action row; `email_runs.rerun_count + 1` | enqueue the failed stage's queue with `rerunFrom` set (`classify` for a classify failure, `triage` for a compare one) |
| `reopen` | `{ note }` | action row; case `open`; stage `review` | none |

Every action carries `actor`, the reviewer's name, which the api requires non-empty. There are no
user accounts in this build; the UI types it once and keeps it in `localStorage`.

**What a rerun is.** `rerunFrom` on a `classify` or `compare` job is a person asking for the email
again. Its presence is the only thing that lets a job pick an email up from `review`, `done` or
`failed`; the pipeline's own jobs may never drag a finished email backwards. It also stops the
judge reusing the answer it gave before the correction, which would ignore the correction it was
asked for. The job id is `{runId}__{emailId}__r{n}` from `email_runs.rerun_count`, because the
original job is kept for a day after it completes and BullMQ refuses a second under the same id.
Not `:r{n}`: BullMQ rejects a custom id containing a colon.

**What settles the case.** The action never does, except where there is nothing left to run. A
stage that ends without an escalation resolves the open case in the name of whoever set the rerun
off (`review_actions.actor`, newest first); a stage that escalates again updates the standing case's
reason and detail in place, because one open case per email run is a unique index.

**Human values win, and they win whole.** Extract and compare read `human_value ?? value`, and a
corrected field also drops the model's `source_quote`, its placeholder and its confidence: the
quote described the value it replaced, and leaving it told the judge that a corrected weight was
quoted from a line reading `N/A`.

**Triage prefers a document a person supplied.** `resolveRoles` fills each place with a
human-origin file ahead of the sender's own, and demotes the loser to `UNKNOWN` so it travels with
the pair rather than competing for its place. A person uploads because what arrived could not be
used; the upload is the answer to that, not a second candidate.

**A failure is not a review reason.** The BullMQ `failed` handler, on the final attempt, fails the
email and opens a case with `kind = 'failure'` and no reason, carrying the message, the first five
stack lines, the attempts and the job id. The submission builder emits the email as incomplete
rather than escalated, and the only action that answers it is `retry`. An *unreachable* doc-extract
never gets here: `failure-policy.ts` reads that as an outage and pauses the queue with the job's
attempts untouched. What reaches here is a permanent failure, such as doc-extract answering 404 for
a key, or an answer that never fits its schema.

### 5.6 What a chat turn may propose

Settled in phase 10, after three phases carrying it as an open question. The shape is
`ProposedAction` in `contracts.chat.ts`; the apply path is phase 11's.

**A turn may propose, and nothing may apply.** Phase 10's scope puts write tools out, so the agent
has no tool that could write one: a proposal is a field on the assistant turn and nothing else. The
card is drawn with both buttons disabled and `blockedReason` under them, rather than hidden,
because the card is the thing being deferred and hiding it would hide that.

| Field | Meaning |
|---|---|
| `kind` | `correct_field`, `reclassify` or `note`: the three of section 5.5's seven a conversation could ever justify. The other four are a person's own acts, not a model's suggestion |
| `emailId` | What it is about. A proposal never addresses more than one email |
| `field`, `side`, `was`, `is` | On a `correct_field`. `was` is what is stored now, so the card can be read without the email beside it |
| `note` | On a `note`, and the free text of the other two |
| `effect` | What applying it would do, in the words the card shows: which stage re-runs, and what becomes a candidate lesson |
| `blockedReason` | Why neither button may be pressed. Never null in phase 10 |

**When phase 11 turns it on**, applying one is a `POST /review/:id/actions` with exactly the body
section 5.5 already defines, so nothing new is written and the rerun behaviour is the one that
already exists. Two rules the shape does not carry and the route must:

- **Only a person applies one.** The turn proposes; the button is the write. There is no path from
  a model's output to a row in `review_actions` that does not pass a click.
- **A proposal needs a case to address.** Every write path is addressed by a `review_case_id`, and
  `review_cases` exist only for escalations, so an email that was never escalated has nothing to
  write against. That is the remaining gap, and it is why the action bar is present and disabled on
  an un-escalated email today. Either the route opens a case of a third `kind` for a correction
  nobody escalated, or corrections outside a case are refused and the card says so. Phase 11
  chooses; `blockedReason` is where the answer is shown either way.

**`Apply and remember` against `Just this once`.** Both write the same `review_actions` row, which
is what re-runs the check. They differ in one field the row does not have yet: whether the
correction is offered to phase 11's lesson drafter as a candidate. `Just this once` fixes this
email; `Apply and remember` fixes this email and asks for the prompt to be changed, which only
ships if the holdout score does not get worse. Phase 11 adds that column in the same commit as the
drafter that reads it.

## 6. doc-extract service

`services/doc-extract`, Python 3.12 on uv, FastAPI, tesseract in the image. Reads bytes from
MinIO by key so large files never pass through Node. The worker reaches it through
`DocExtractClient` (`src/doc-extract/`, zod-parsed, with a memory fake).

| Route | Body | Returns |
|---|---|---|
| `GET /healthz` | | `{ ok, tesseract: version, langs }` |
| `POST /extract` | `{ key, filename, content_type? }` | see below |
| `POST /render` | `{ key, filename, out_prefix, dpi? }` | `{ pages: [{ index, key: "<out_prefix>/1.png", width, height }] }`; `[]` for a non-PDF or a file that will not open |

`/extract` response:

```json
{
  "format": "pdf",
  "text": "full text, pages joined with \f",
  "pages": [{ "index": 1, "text": "...", "source": "text_layer" | "ocr" | "none", "ocr_confidence": 91.2 }],
  "unreadable": false,
  "scanned": true,
  "warnings": ["page 1: no text layer, read by OCR"],
  "bytes": 21090
}
```

Per format:

| Format | Library | Notes |
|---|---|---|
| `.txt` | stdlib, utf-8 then cp1252 | line endings normalised |
| `.pdf` | PyMuPDF words regrouped by baseline, so a label and the value drawn beside it share a line; a page with under 20 characters of text layer is rasterised at 220 dpi and read by tesseract (`--psm 6`, `eng+chi_sim`, falling back to `eng` with a warning) | garbled or unopenable → `unreadable: true` |
| `.docx` | python-docx, paragraphs and tables in document order, each table row `label: value` with further cells after a bar | bilingual labels kept as-is |
| `.xlsx` | openpyxl, each row `A: B` (`A` alone when only the first cell is set), one page per sheet, integral numbers without separators | |
| 0 bytes, unknown extension | | `unreadable: true` |

Unreadable, decided by the service: empty, would not open, no pages, every page without text,
under 40 characters in total after OCR, or OCR confidence under 40 on every page. A bad file is
never a 5xx: it is HTTP 200 with `unreadable: true` and the reason in `warnings`. The only 5xx is
the object store failing, answered 503 with `retryable: true`; the client turns that, and an
unreachable service, into `DocExtractUnavailableError`, which pauses the queue like an LLM outage.

The worker writes the extracted text to MinIO under `.../text/{name}.txt`; the service stays
stateless.

Vision path (*verify*): if the proxy accepts image content blocks, `compare.worker` sends the
rendered page PNGs to the extraction model when `ocr_confidence < 0.7`. If the proxy drops
images, OCR text is used and the reviewer sees the PNG.

## 7. LLM layer

- Client: existing `src/llm.ts` against `LLM_PROXY_URL/v1/messages` (Anthropic wire; the Anthropic SDK with `baseURL` set to the proxy).
- One transport. The proxy is the `llm-proxy` service of the same compose stack; the second
  transport to another Retina API's `/ai/chat` was removed with the remote proxy it existed for,
  and `config.ts` refuses to boot an `LLM_PROXY_URL` that still names one.
- A `claude` with no login is the proxy's `provider_not_logged_in`, 502 with `retryable: false`,
  so the backend fails the email at once with a message naming `CLAUDE_CODE_OAUTH_TOKEN` instead
  of reading a missing secret as an outage and requeueing forever.
- Error envelope: the proxy answers `{ type: "error", error: { type, message, code, retryable } }`.
  `code` is its stable machine name and `retryable` its own verdict on whether another attempt could
  work. The backend reads `retryable` and falls back to the status only when it is absent: status
  alone cannot separate `unknown_provider` (a permanent 500) from a dead upstream (a transient 502),
  and treating the first as the second requeues a misconfiguration forever without spending an
  attempt. `app.ts` relays the flag on its own error body, for callers of the API's own `/ai/chat`.
- Structured output: the schema is a provider constraint, not a request. `agents/structured.ts`
  derives JSON Schema from the zod schema and sends it as `LlmRequest.outputSchema`, which
  `llm.ts` puts on the wire as `output_config: { format: { type: "json_schema", schema } }`. The
  proxy turns that into `claude -p --json-schema` (answer read from the envelope's
  `structured_output`) or, for an OpenAI-compatible server, `response_format`. The same schema is
  still printed into the system prompt so the model knows what the fields mean, and zod still
  validates the answer, because a provider may ignore the constraint and zod holds rules the
  JSON Schema subset cannot (structured output ignores `minimum` and `maxLength`). On a zod
  failure it retries once with the validation issues appended, then throws `TerminalError`.
- `max_tokens` is optional, in prompt frontmatter and in `LlmRequest`. The default of 8000 is a
  ceiling, not a budget. A `max_tokens` stop reason is a `TerminalError` straight away: a retry
  under the same cap truncates the same way.
- Prompt registry: `agents/prompts/<step>/<version>.md` with frontmatter
  `{ step, version, model, max_tokens? }`. `POST /runs` pins a version and a model per step in
  `runs.prompt_set` (`agents/prompts/prompt-set.ts`): the run's `promptSet`/`models`, else the
  `core.prompt_versions` active row and `LLM_MODEL_<STEP>`, else the newest file and its
  frontmatter model. The worker loads exactly what the run pinned, so a file added mid-run cannot
  change it. A run from before pinning (`prompt_set = {}`) gets the active versions, never simply
  the newest file, which may be an unvalidated experiment. `PromptSet` drops a step it does not
  know, so code rolled back under a later phase's runs still reads them. Every call stores
  `prompt_version`.
- Few-shot examples live in `agents/prompts/<step>/examples.<version>.json`, filled into the
  prompt's `{{examples}}`. `pnpm eval:examples` writes them from the train split, never from the
  holdout or the dev sample.
- Timeouts: one request timeout of 600 s for every step (`REQUEST_TIMEOUT_MS` in `llm.ts`); there is no per-step value. The SDK's own retries are off
  (`maxRetries: 0`): a hidden second call doubles a hung call's wall time, holds a worker slot and
  makes the ledger understate calls and cost. `proxyLlmClient` retries a transient failure twice,
  at about 1 s and 3 s with jitter, while `isTransient(error)` holds (the proxy's verdict, never a
  status list), then throws `LlmUnavailableError` and the queue pauses (4.5). A permanent failure
  is a `TerminalError` at once. A timeout (600 s) is `LlmTimeoutError`: not retried in the client,
  not an outage, so the queue spends an attempt and a call that always hangs ends as a failure.
- A verifier that fails for good leaves the generator's category in place with `verifierError`
  in the rationale. A retry after a verifier outage reuses the generator's answer from the ledger
  (`llmCalls.latestAccepted`) instead of paying for it again.
- Every call logs one line (`structured` module, info) with step, model, attempt, latency and
  tokens; `LOG_LEVEL=debug` logs the full system prompt, input and answer.
- Live preview: a call made for an email streams (`LlmRequest.onText`, `llm-stream.ts`), and
  `agents/live-preview.ts` keeps the answer so far in Redis at `live:call:<email run id>` (15 min
  TTL, at most one write per 250 ms, cleared when the call ends either way) through the `LiveCalls`
  seam in `src/live/`. With a schema the preview is the JSON being written; the answer is the
  proxy's validated `structured_output` on the final `message_delta`, with `usage.cost_usd`.
  Each attempt at a schema answer is its own content block, and the preview restarts at each,
  because the model sometimes writes a malformed first attempt that the CLI rejects. Redis for
  previews is its own connection with the offline queue off: a preview write never waits on a
  down Redis, and a failed one is logged, never fatal.
- Every call inserts `core.llm_calls` with step, model, prompt_version, request, response,
  input_tokens, output_tokens, cost_usd (from the proxy's usage block), latency_ms, email_run_id.
- Models: `sonnet` for every step (decided 2026-09-19). Values must be proxy aliases: `sonnet`,
  `opus`, `haiku`, and `test` for smoke tests. Env vars and a run's `models` allow swapping per
  step for experiments. There is no local model: Ollama was dropped when the proxy moved into
  the stack.

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
                    rerun_count int default 0,   -- how many times a person sent it back; the rerun's job id carries it
                    outcome text, error text, started_at, finished_at, unique(run_id, email_id))
attachments        (id bigserial pk, email_id fk, run_id fk, filename text, role text, origin text default 'source',
                    review_case_id fk null,      -- the case a human-origin file was supplied for
                    object_key text, content_type text, bytes int, sha256 text)
documents          (id bigserial pk, email_run_id fk, attachment_id fk, role text, doc_type text,
                    doc_type_confidence numeric, doc_type_rationale text, format text, text_object_key text,
                    pages int, scanned bool, unreadable bool, warnings jsonb,
                    page_confidence numeric[],   -- mean OCR word confidence per page, 0 to 100, tesseract's own scale
                    unique(email_run_id, attachment_id))
classifications    (id bigserial pk, email_run_id fk unique,
                    gen_category text, gen_confidence numeric, ver_category text, ver_confidence numeric,
                    final_category text, human_category text, decided_by text, rationale jsonb, prompt_version text)
extractions        (id bigserial pk, document_id fk unique, email_run_id fk, role text check (role in ('SI','BL')),
                    prompt_version text, model text, verified bool, created_at)
extraction_fields  (id bigserial pk, extraction_id fk, field text (the seven), value text, placeholder text,
                    source_quote text, confidence numeric, evidence_ok bool, human_value text, note text,
                    unique(extraction_id, field))
comparisons        (id bigserial pk, email_run_id fk unique, status text, review_reason text,
                    has_defect bool, decided_by text, created_at)
field_diffs        (id bigserial pk, comparison_id fk, field text (the seven), si_value text, bl_value text,
                    same bool, missing bool, confidence numeric, rationale text, unique(comparison_id, field);
                    every field's judgement, not only the differing ones: defect_fields is where same and missing are both false)
review_cases       (id bigserial pk, email_run_id fk, kind text check (kind in ('review','failure')),
                    reason text (the organisers' four; set exactly when kind = 'review'), stage text, detail jsonb,
                    status text check (status in ('open','resolved')), opened_at, resolved_at, resolved_by text;
                    one open case per email_run)
review_actions     (id bigserial pk, review_case_id fk, email_run_id fk,
                    kind text check (kind in ('confirm','correct_field','reclassify','note','upload','retry','reopen')),
                    field text (the seven), side text check (side in ('SI','BL')),
                    old_value text, new_value text, note text, actor text not null, created_at;
                    append only: a correction later reopened is two rows, never one changed one)
llm_calls          (id bigserial pk, email_run_id fk null, step text, model text, prompt_version text,
                    request jsonb, response jsonb, input_tokens int, output_tokens int, cost_usd numeric,
                    latency_ms int, ok bool, error text, created_at)
prompt_versions    (step text, version text, active bool, notes text, created_at, primary key(step, version))
submissions        (id bigserial pk, run_id fk, payload jsonb, scoreboard jsonb, final_score numeric, created_at)
lessons            (id bigserial pk, step text, text text, source_review_action_id fk, status text
                    check (status in ('candidate','approved','rejected','shipped','rolled_back')),
                    eval_before numeric, eval_after numeric, approved_by text, created_at)
chat_conversations (id uuid pk, title text, created_by text, created_at)
chat_turns         (id bigserial pk, conversation_id fk, role text, content text, tool_name text,
                    tool_args jsonb, tool_result jsonb, duration_ms int, sql_used text[],
                    llm_call_ids bigint[], in_reply_to fk -> chat_turns(id), created_at,
                    check ((role = 'tool') = (tool_name is not null)))
```

Shipment-level entities (`shipments`, `parties`, `ports`, `carriers`) are populated from
verified extractions in a later phase; the columns above are enough for scoring, review, and
explainability. Indexes: `email_runs(run_id, stage)`, `review_cases(status)`,
`llm_calls(email_run_id)`, `emails(sender_domain)`, `review_actions(email_run_id)`,
`review_actions(kind, created_at)`.

### 8.2 `analytics`

Built in phase 10, migration `010_analytics.sql`. Refreshed by the `refresh-analytics` scheduled
job every 5 minutes, and only when `core` has moved: `ontology/derived.ts` compares each derived
thing's own watermark against the table's, statelessly, so a worker restart cannot lose a mark.

There is no refresh on run completion. `resolve-case.ts` runs per email and `processingDone` is
computed in the run summary rather than raised, so there is no run-completion event to hang one on,
and inventing a seam so a 520 row view refreshes a few minutes sooner is not worth it. The clock is
the trigger. `pnpm derive` forces it now, for straight after a deploy and before a demo.

| View | Grain | Notes |
|---|---|---|
| `fact_email_outcome` | (run_id, email_id), materialised | `category` is `human_category ?? final_category`; `model_category` is the model's alone. `n_defects` counts judgements that differed, not all seven |
| `fact_field_diff` | (run_id, email_id, field), materialised | All seven per comparison. `differed` is `not same and not missing` and is what "a defect" means. `judged` is `rationale is not null`: the field judge is the only writer of one |
| `dim_client` | domain, view | `clients.repo.ts:list` as a view, driven off `core.emails`, so a sender nobody ranked is still a client and `known` is false |
| `dim_run` | run, view | plus the newest submission's `final_score` |
| `agg_client_run` | (run_id, sender_domain), materialised | `top_defect_field` answers "and on which field" without a join |
| `agg_run_stage` | run_id, materialised | counts per stage, `verifier_decided`, `human_decided`, calls and cost |

**There is no `rule_decided`.** `classifications.decided_by` is `llm | verifier | human` and
`comparisons.decided_by` is `llm | human`. `rule` belongs to the organisers' submission enum and
nowhere else, because no hand-written rule decides a category in this product, on purpose.

**The default tier is `core.default_tier()`**, mirrored by `DEFAULT_TIER` in
`contracts.clients.ts`, and `analytics.test.ts` holds the two equal.

### 8.3 Ontology entities

Migration `013_ontology_entities.sql`. `core.entities`, `core.entity_names`,
`core.entity_mentions`, all derived and rebuildable: `pipeline/ontology/resolve.ts` produces them
from `extraction_fields` and `field_diffs` alone.

**The only edge that joins two spellings is a `field_diffs` row with `same = true`.** No
lowercasing, no punctuation stripping, no edit distance, no lookup table: all four are rules fitted
to one seed of one dataset. Two spellings no judge ever compared stay two things, and
`entity_names.joined_by` says how each one joined, so that reads as a fact about the data.

`kind` was `port` (from `port_of_loading`, `port_of_discharge`) or `party` (from `shipper`,
`consignee`, `notify_party`). Phase 10f widened it to six: `carrier`, `person`, `commodity` and
`vessel` are read out of the mail by `shipment-read`, not out of the seven fields. Only `shipment`
is still never `built` and drawn dashed: `core.email_shipments` holds one row per email and
nothing yet groups them into one booking across its instruction, its draft and its invoice query.

**Ids survive a refresh since phase 10f.** `pipeline/ontology/reconcile.ts` plans each resolved
cluster onto the entity that already holds its spellings, and `entities.resolution.ts` carries
that plan out: kept rows are updated, new ones inserted, and two things a new verdict joined are
merged with a tombstone (`merged_into`) on the loser so a stored verdict or a remembered
grounding can follow it. **Every read of `core.entities` filters `merged_into is null`**;
`get_entity` follows the tombstone instead. This replaced `entities.replaceAll`, which deleted
everything and reinserted; a profile, a concept verdict and a shipment column all hang on an id
now, and all three would have pointed at something else by the next refresh.

An **appearance** is an email, not a mention. A port read from both documents of one email is one
appearance read twice, and the same email replayed in three runs is still one appearance:
`entities.detail.ts:appearances` keeps the newest run's row per (email, field) and reports the
sides it was read from as a field. Listing mentions put one subject on screen four times and told
a reader nothing the sides and the count do not.

### 8.3a The semantic layer (phase 10f)

Migrations `017` to `021`. Nothing here runs before an email's verdict is written, so nothing here
can move the score.

| Table | What it holds |
|---|---|
| `core.entities` (+ columns) | `attributes` and `attributes_source` jsonb, `profile_md`, `profile_version`, `stale`, `merged_into`, `sighting_count`, and a `search` tsvector generated from `search_text` |
| `core.entity_sightings` | one row per thing per place it was read outside the seven fields: `role`, `source` (subject, body, header, document), `surface`, `address`, `source_quote`, `ambiguous`. Per email, not per run |
| `core.entity_appearances` (view) | `entity_mentions` and `entity_sightings` under one name, with `disputed` true for the draft bill's side of a field the judge called different |
| `core.email_shipments` | one row per email: the references, the goods, the terms, `mail_date` with its quote, `disputed_fields`, and the eight entity ids |
| `core.concepts` | a term written nowhere in the database, with the definition the model wrote, its search terms, `asked_count` and `backfill_wanted` |
| `core.concept_verdicts` | one verdict per (concept, thing), against the `profile_version` it read. `matched` is a stored column equal to `verdict = 'yes'`, so the subquery a chat turn joins on carries no string literal |

Five LLM steps, all `sonnet`, all under `agents/prompts/<step>/v1.md`:

- **`shipment-read`**, one call per email, reads what the mail states beyond the seven fields.
  Every value carries a `source_quote` and the `source` it came from, and
  `pipeline/ontology/shipment.ts` drops any whose quote is not in that text. A number and a date
  are read rather than copied (tonnes to kilograms, `28-Jan-26` to an ISO date), so only their
  line has to be found.
- **`entity-resolve`**, one call per spelling nothing already holds. `planSighting` is pure: a
  spelling one live thing already holds is a judgement some model already made and costs no call;
  two things or none both go to the model. A name it adds is written with
  `entity_names.joined_step = 'entity-resolve'` and read back as a verdict on the next resolution
  pass, so the two judges cannot disagree about which cluster a spelling is in.
- **`entity-profile`**, one call per stale thing, from a dossier of fixed size
  (`pipeline/ontology/dossier.ts`). Its output keeps `observed` (only what the dossier showed)
  apart from `general` (the model's own knowledge, unverified, with a confidence), and names the
  basis of every attribute it filled. `ONTOLOGY_KNOWLEDGE=mail` leaves `general` null; a person
  never gets one under either setting.
- **`concept-define`**, once per phrase, reusing a meaning already written for it. The definition
  is shown to the reader, so a disagreement about what "Asia" covers surfaces in the answer
  instead of in the numbers.
- **`concept-judge`**, `JUDGE_BATCH` things per call, with the schema built from exactly the ids
  sent. `unknown` is "no basis either way" and is reported apart from `no`.

The `ontology` queue carries one job per email at priority 2000, below every scored job. It is
enqueued by the compare worker once the email reaches `done` or `review`, and its job id is the
email id with `removeOnComplete: true`, so a reviewer's correction can send the same email
through again. Two scheduled tasks run beside it: `refresh-profiles` every ten minutes
(`PROFILE_BATCH` stale things, never-profiled first, skipping anything written within
`PROFILE_FLOOR_HOURS`) and `backfill-concepts` every five (one concept marked `backfill_wanted`,
one budget of it).

**The cost model is `plan-judging.ts`.** A verdict is stored against the profile version it read,
so a question asked twice is a lookup and a rewritten profile re-judges exactly the things it
describes. Above `JUDGE_BUDGET` the answer says `complete: false` with the number left, and a
total over it is a lower bound.

### 8.4 Roles

Migration `011_ro_role.sql`, plus `014_ro_entities.sql` for the tables `013` added afterwards.

```sql
create role retina_ro login password :'ro_password';   -- substituted by db/migrate.mjs from PG_RO_PASSWORD
grant usage on schema core, analytics to retina_ro;
-- table by table, never `all tables`: the list is the documentation of what the agent may read
grant select (id, email_run_id, run_id, step, model, prompt_version, input_tokens, output_tokens,
              cost_usd, latency_ms, ok, error, attempt, created_at) on core.llm_calls to retina_ro;
alter default privileges in schema core, analytics grant select on tables to retina_ro;
alter role retina_ro set statement_timeout = '5s';
alter role retina_ro set default_transaction_read_only = on;
```

The chat agent's pool uses `DATABASE_RO_URL`. `llm_calls.request`, `response` and `parsed` are
excluded column by column so prompts and model text cannot leak through free-form SQL; the
`explain_decision` tool reads rationales through the read-write pool with a fixed query instead.

**A grant does not reach a table added later.** `011` ran before `013` created the entity tables,
so the agent was told about three tables it could not read. `014` grants them and sets default
privileges, and `analytics.test.ts` holds it. A new table the agent reads needs a grant in the same
commit as the table: `018` grants its four tables and the view by name rather than trusting the
default privileges to cover a view.

A role belongs to the cluster, not a database, so `retina_test` and development share one password:
`vitest.config.ts` and `.env.example` both say `localdev`.

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
| `GET /health` | `{ status: ok \| degraded \| down, checks, version, queues }`, 2 s per check, unauthenticated. A check is an object: `{ status, latencyMs }` plus whatever that dependency says about itself, which comes free from its own health payload (`inbox` its email count and whether scoring is available, `docExtract` its tesseract build, `llmProxy` its alias count, `worker` its last heartbeat). `worker` is not a probe but the mark the worker leaves in Redis every 10 s, read back; null when none stands. `down` and 503 only for postgres or redis, which is the signal auto-deploy rolls back on: everything else, a stale heartbeat included, is `degraded` and still 200. `llmProxy` is read through its `/healthz`, which lists aliases and starts no session, so a cold model never reads as an outage. `version` is `GIT_SHA` from the build arg, `dev` outside an image. `queues` is null when Redis cannot be reached |
| `GET /clients`, `PUT /clients/:domain` | every sender domain seen, full-outer-joined to `core.clients`, with its tier, kind, email count and mismatch count, and `known: false` for one nobody has ranked. The `PUT` upserts `{ name?, tier?, kind? }`, writes the `client:priority` hash after Postgres, and changes no category: `kind` is a label a person sets and nothing in the pipeline reads it |
| `POST /runs` | start a run `{ source, ratePerSecond, limit?, emailIds?, subset?: dev \| holdout, promptSet?: { step: vN }, models?: { step: alias } }`. `subset` reads the id lists in `backend/eval/` (ids only). 400 for an unknown prompt version or a model that is not a proxy alias, before anything is queued |
| `GET /runs`, `GET /runs/:id` | list, detail with stage counts, `finishedEmails` (done, failed and review), `processingDone`, `elapsedMs` (start to the last email finishing, or to now), queue depth, `promptSet`, `llm` usage with `verifierShare`, `review: { open, byReason }`, `outcomes: { ok, mismatch, byField }` over the compared pairs, score (`lastSubmission.scores` carries the scorer's own `weights`, so a page never assumes them). The list also carries `concurrency: { classify, llm }` from the env. `queues` is `null` when Redis cannot be reached; the rest comes from Postgres and is still served |
| `POST /runs/:id/pause`, `/resume`, `/cancel` | control the replay |
| `POST /runs/:id/submit?force=false` | build submission, post to averis, store scoreboard. 409 when the run holds fewer rows than `totalEmails` (still ingesting) or holds unfinished emails, both overridden by `?force=true`; 409 while another submission for the same run is being scored. The `core.submissions` row is written before the scorer is called and updated with the scoreboard after, so a scorer failure leaves an unscored row (null `scoreboard`, null `final_score`) pointing at the stored payload rather than an orphan payload. Only scored rows count as a run's last submission |
| `GET /runs/:id/submission.json` | download the payload |
| `GET /runs/:id/emails?stage=&category=&decidedBy=&outcome=&q=` | paginated list with `category`, `decidedBy`, `confidence`, `verifierCategory`, `outcome` (`not_comparable`, `OK`, `MISMATCH` or a review reason), `defectFields`, `error` |
| `GET /runs/:id/queues` | who holds each slot of each queue and who is next: per queue `concurrency` (from the worker's env), `waiting`, `active`, `failed`, `heldUntil` (set while `failure-policy.ts` has it rate limited, an instant so a stale poll cannot skew the countdown), `slots` (`emailId`, what the model is doing in plain English, `startedAt`, `elapsedMs`) and `next` (the five oldest waiting, with their attachments read as "two files, txt and pdf" and how long they have held). Plus `handoff: { needCheck, notComparable }`, the crossing between the two queues, aggregated here because the frontend holds no business logic. `reachable: false` with empty queues when Redis cannot be reached, never zeroes, which would read as a finished run |
| `GET /runs/:id/calls?after=&limit=` | the run's newest `llm_calls` as summaries (no prompt or email text), newest first, for a live feed; `after` returns only newer ids |
| `GET /runs/:id/live` | the run's model calls running now, each with the answer written so far (`LiveCallView`) |
| `GET /runs/:id/emails/:emailId/trace` | one email: stage, error, how its category was settled (each reader's category, confidence, reasoning, counter-cases, verifier error), its documents (the role the filename claims, the model's type with confidence and rationale, format, pages, scanned, unreadable, warnings, `pageConfidence`: the mean OCR word confidence per page in page order, empty for a document with a text layer), its open review case, its `extractions` (per document: the place it filled, whether the verifier ran, the seven fields with value, placeholder, quote, confidence, evidence and any human value), its `comparison` (status, reason, defect fields, every field's judgement), the call running now, and every finished call oldest first with system prompt, input, answer text, parsed answer, tokens, cost, latency |
| `GET /prompts` | each prompt step's versions on disk, newest first, with the active one, the model the file names and any notes; the runs page offers exactly these |
| `GET /emails/:runId/:emailId` | full trace: email, attachments, classification, extractions with fields, comparison, diffs, review case, llm_calls summary |
| `GET /review?status=&reason=&kind=&runId=&page=&pageSize=` | the review inbox, oldest first: each case with its email's subject and sender, the reason, `openedAt` as an instant, and how many actions it has had with who last wrote one. `status` defaults to `open` |
| `GET /review/stats?runId=` | open by reason, how many are failures, resolved today, and the median time to resolve over the last week |
| `GET /review/:id` | one case with its full history |
| `POST /review/:id/actions` | `{ kind, actor, ...fields }`, validated per kind by a zod discriminated union. Answers the case as the queue shows it, the action row, which queue a rerun went to, and one sentence naming what was written. 409 when the case is not in a state for that kind |
| `POST /review/:id/upload` | multipart (`multer` memory storage, 20 MB cap, extensions `txt pdf docx xlsx`), fields `actor`, `role`, `note?`. The bytes are sniffed against the name the file claims (`%PDF-`, the zip `PK` of an Office file, decodable UTF-8); a mismatch is 409, not a document stored and found unreadable three stages later |
| `GET /queues` | superseded by `GET /runs/:id/queues` above, which is run scoped and carries the slots as well as the counts. A global view has no reader: every screen that asks is looking at one run |
| `POST /chat/conversations` | `{ title?, runId?, emailId?, actor }`. `runId` and `emailId` are the conversation's scope, which the rail draws as its `Reading` chips: a default the agent may widen when a question asks something wider, never a filter it cannot see past |
| `GET /chat/conversations?runId=`, `GET /chat/:id`, `DELETE /chat/:id` | list, the thread with its turns, delete. A turn carries its tool calls, its result graph and the SQL it ran, so reloading a conversation brings the evidence back with the sentence |
| `POST /chat/:id/messages` | `{ content, actor, skills? }` runs one turn and answers `{ turn, exhausted }`. `skills` is up to three names the person picked in the composer, refused with 400 when the registry does not know one, and injected exactly as an event-injected skill is. The question is stored before the model is asked, so a turn that fails halfway still leaves the person's words on the page. No streaming; the frontend route handler declares `maxDuration = 300` and the client times out just under it. Aborting the request stops the turn between steps, and what it had is still stored |
| `GET /chat/:id/turns?after=<id>` | every turn newer than one id, **including the `role: tool` rows** a turn writes as each call finishes. The only read that returns them. The page polls it once a second while its own POST is in flight, which is how the steps appear one by one |
| `GET /chat/skills` | the skill cards for the composer's `/` menu: `{ name, version, when }`. The bodies are never sent; they are for the agent |
| `GET /ontology/types` | the five types the rail offers, with live counts and `built`: Emails, Ports, Parties, Shipments, Carriers. The last two are never built, because nothing in the seven fields yields a booking or a vessel, and the rail draws them dashed. The other seven `ObjectType`s are real and are reached through an object rather than browsed; `client` in particular folds into `party`, since a sender domain and a consignee are the same company read two ways |
| `GET /ontology/:type`, `GET /ontology/:type/:id`, `/:id/detail`, `/:id/graph?hops=1\|2` | the index of a resolved kind; one object in the one shape every type shares; the four parts a resolved thing opens into; and one email's graph as nodes and named edges. The graph carries no coordinates: the layout is one pure function in the frontend with a table-driven test. All six kinds of `EntityKind` list and open; a type that is a table of its own answers 404 naming `/database/tables`. `detail` carries `insight`: the summary, the identity facts with a `verified` flag per attribute, the scale (emails, appearances, spellings, disputed, first and last mail date) and at most three facets of the kind's own trade, built by the pure `pipeline/ontology/insight.ts` from the same `DossierInput` the profile prompt is rendered from |
| `GET /ontology/shipment`, `/shipment/:id` | the consignments, newest first, and one opened: its references, the eight things on it in bill-of-lading order with the disputed ones marked, and what each email of the group stated with the line it was read from. A shipment is a group of emails sharing an identifier (`oc_no`, `bl_no`, `booking_ref`, `invoice_no`, `po_no`), grouped by the pure `pipeline/ontology/shipment-group.ts` and regrouped whole every minute by the `regroup-shipments` scheduler. On this inbox every group holds one email: the generator draws fresh references per mail |
| `GET /database/tables`, `/tables/:schema/:name?limit=&offset=`, `/tables/:schema/:name/rows/:id` | every relation of `core` and `analytics` with an exact count; a page of one with typed columns and the SQL that produced it; one row as fields plus what points at it by foreign key. Identifiers are read out of `pg_catalog` and checked against a pattern before they reach a query; this path composes its own SQL and takes nothing a caller wrote, which is why it does not use the RO pool |
| `GET /eval/runs/:id` | holdout, full-set and this-run scoreboards computed locally, plus `emails`: each email of the run, its answer beside the truth, check by check on the scorer's definitions (`EmailVerdict`), shown at `/runs/[id]/results`. Each verdict also carries `classify`: the chain that produced it (`gen`/`ver` category and confidence, `decidedBy`, the human's category where there is one, model, prompt version) and `effect`, what the verifier did to the generator's answer judged against the truth (`not_run`, `fixed`, `broke`, `agreed_right`, `agreed_wrong`, `changed_still_wrong`, from the pure `eval/verifier-effect.ts`). Null for an email that was never classified. The rationales are not here: the page fetches one email's trace when a row is opened. Dev only; 404 on the VPS where ground truth is absent |
| `GET /lessons`, `POST /lessons/:id/approve|reject` | gated self-improvement |
| `GET /files/*key` | stream one object: an original attachment, a rendered page, or a document a reviewer supplied. Read only, and a key with a traversal segment is refused rather than resolved |

Contract types live in `backend/src/contracts.ts` and are copied into
`frontend/lib/api-client.ts`, as the template already does for `/ai/chat`.

## 11. Chat agent

`agents/chat/loop.ts`: one step per model call, each step either one to four tool calls run
together or the answer, max 8 steps per turn. Tool use is a JSON protocol rather than a provider's tool-call API, because every call
goes through the proxy to `claude -p` and the wire between them carries text.

**The step schema is one flat object, never a union.** The provider refuses `oneOf`, `anyOf` and
`allOf` at the top level of a tool schema, and says so as a 502 from the proxy marked retryable, so
a caller retries a call that can never succeed. `agents/structured.ts:toOutputSchema` throws a
`TerminalError` naming the fix instead. Any future step with two shapes does the same: one object
with the discriminant as a field, narrowed after it parses.

The prompt is `agents/prompts/chat/v3.md`; the schema documentation it is given is
`agents/chat/schema-docs.md`, hand written, one block per view with its grain, its columns, every
closed set of values, and example questions with the SQL that answers them. Every loop
iteration is one `llm_calls` row with `step = chat` and **`run_id = null`**, even when the
conversation is about a run: a run's cost is what the pipeline spent on it, not what somebody asked
about it afterwards.

### 11.1 The harness (phase 10d)

A turn does not start blind. Besides the question it is given, in this order:

| Part | Where | What it is |
|---|---|---|
| Standing instructions | `agents/chat/CHAT.md`, versioned | how to start a turn, how this mailbox stores things, the rules of evidence |
| Orientation | `agents/chat/orientation.ts`, SQL in `orientation.repo.ts` | what the database holds right now: runs, the scoped or latest run's counts, every port (up to 60) and the top parties with ids, sender domains, what is not there. Computed on a conversation's first turn, kept in `chat_conversations.orientation` with a watermark, recomputed only when a run progressed or the resolver rebuilt |
| Skills | `agents/chat/skills/<name>/SKILL.md`, versioned | how to do one kind of task here. A two-line card per skill is always shown; a body is injected or loaded |
| Recipes | `agents/chat/skills/<name>/recipes/<recipe>.sql` | a named, parameterised query with declared parameters and columns. Passes `guardSql` when it loads, runs on `roPool`, tested as `retina_ro` |

**Structure is written, values are computed.** `CHAT.md`, the skills and the recipes name no
company, port, sender or subject code (`chat-harness.test.ts` holds that); what exists is the
orientation's to report.

**Injection** (`inject.ts`, pure) is decided from facts the harness can see, never from the words of
the question: the person picked a skill, the agent loaded one, a call was refused by the literal
guard or came up empty (`ground-names`), the conversation is about an email (`explain-an-email`) or
a run (`pick-the-run`), a skill was loaded earlier in the conversation. At most three.

Phase 10e adds two facts and two skills to that list. A lookup that came up empty also injects
`near-misses`; a lookup that returned candidates of **more than one kind** injects `ask-back`.
Several candidates of one kind are deliberately not an ambiguity: a short company name matching four
companies of one group means all four, which is what `ground-names` already says. `find_entity` is
the only tool that sets `ambiguous`, from the kinds it returned and nothing else.

**The literal guard** (`grounding.ts`, pure). `run_sql` and the text arguments of `run_recipe` are
refused when they filter on a string the agent was never shown: not in `CHAT.md`, the schema notes,
the orientation, a skill, the agent's own earlier answers or a tool result on this turn. The
person's words are deliberately not part of that. Patterns (`like`, a text search), dates, numbers,
uuids, intervals and format strings pass, and so does a string that is exactly a stored spelling,
email id or sender (`entitySearch.knownValues`). Over MCP there is no turn, so the guard stands down.

The turn stores `reading` (one sentence on how the question was read), `skillsUsed`
(`name, version, how`), `adhoc` (it needed SQL of its own, which is the backlog for the next
recipe), `standingVersion` (which `CHAT.md` produced the answer) and `grounded` on the assistant
turn's `tool_result`, beside the tool calls and the graph.

### 11.1a What an answer claims, and what it offers next (phase 10e)

The final step carries four more fields, all defaulted, all on one flat object.

| Field | What it is |
|---|---|
| `outcome` | `answered`, `none_found`, `partial` or `needs_input`. Not an error state: `none_found` is a correct answer about something that is not in the data |
| `checked` | where it looked, in the reader's words. Required when the outcome is `none_found` |
| `next` | up to four chips, each `{ kind, label, prompt, thing, count, basis }`. `prompt` is a whole question, so clicking a chip is the same as typing it and needs no route |
| `clarify` | `{ question, options }`, two to five options. Required when the outcome is `needs_input` |

**An alternative is real or it is not offered.** `agents/chat/next-moves.ts` (pure, table-tested)
drops any move whose `thing` and `count` did not come back **on one row** of a tool result on that
turn. It checks `FinishedCall.grounds`, which is what the data returned, and never `text`, which
also echoes what was asked for: a check against text would let the agent recommend Jakarta on the
strength of having asked about Jakarta. Row by row and not over the whole text, because a query
listing every port and a query counting one email would otherwise ground any pairing at all. The
prose around a chip is not checked, and cannot be.

**A claim that carries an obligation is handed back once.** `none_found` with no `checked`, or
`needs_input` with no `clarify`, is returned to the agent with the reason, exactly as a tool step
naming no tool is. A second offence is settled in code: the outcome falls back to `answered`, the
unsupported claim is dropped and the prose is stored as written.

**General knowledge may relate, never report** (`CHAT.md` v2). The model may use what it knows to
connect the person's term to values a tool just listed: which of these ports are near a place, which
of these companies are one group. It may not state a fact about this mailbox from memory, and a move
its own knowledge chose carries `basis: "general_knowledge"`, which the chip marks.

`CHAT.md` v3 adds the one exception, and only because it is already labelled where it is stored: a
profile's **general knowledge, unverified** section, and an attribute `get_entity` says came from
`model`, may be repeated with that label as a claim about the world. It is still never a claim
about this mailbox, and the agent may not extend it.

### 11.1c A term no column holds (phase 10f)

`ChatTurn.semantic` carries one `SemanticReading` per term the turn had to give a meaning to:
the concept's id, the phrase, the definition, and the counts (`matched`, `judged`, `reused`,
`unknown`, `deferred`, `complete`). It is on the turn and not only on the answer, so a total
stated as a lower bound still reads as one after a reload. The reading line above the answer
draws each one with its definition in full: a reader who disagrees with "Asia" can then disagree
with the words rather than with a number.

The harness injects the `meaning-terms` skill once a call has reported a reading. That is the only
fact it can see without reading the question's own words, which would be a subject keyword table
by another name; before that, the skill's card is in front of the agent and `load_skill` is the
way in.

### 11.1b Live steps, stop, and what a conversation remembers (phase 10e)

**Steps are rows as they happen.** The loop takes an `onStep` callback and the route writes one
`role = 'tool'` row per finished call, with `in_reply_to` set to the question it serves
(`016_chat_live.sql`). `GET /chat/:id/turns?after=<id>` is the only read that returns those rows;
`chat.turns()`, `chat.recentTurns()` and `turn_count` all still leave them out, so a thread read
afterwards is unchanged and the model is never handed its own steps twice. The page polls it once a
second while its own POST is in flight. A step's calls run together, so `onStep` fires once per step
with up to four calls, and it is awaited: a write that lands late shows the steps out of order.

**Stopping is the client aborting the POST.** Express reports that as `close` before a response was
sent; the loop reads the flag **between** steps and returns what it had with `outcome: "partial"`. A
model call already in flight is left to finish, because abandoning it would leave an `llm_calls` row
no turn accounts for. The turn is stored either way, so the browser re-reads `?after=` for a few
seconds to pick up whatever landed.

**Conversation memory** (`agents/chat/memory.ts`, pure; `chat.memory.ts` reads it) gives the next
turn the things earlier turns grounded as `(kind, canonical, spellings)`, the runs their recipes
were bound to, and the last turn's open clarifying question. **By name and never by id**:
`entities.replaceAll` deletes and reinserts, so every id changes on a refresh, and a canonical is
one indexed lookup away. It is for the model only and is **not** part of `shown`: nothing from an
earlier turn grounds a literal, or a filter could be grounded on the person's own question.

### 11.2 Tools

Each tool's argument shape is derived from its zod schema (`tools/args-signature.ts`) into the
prompt and into the bad-arguments message. A tool that throws comes back as a refusal.

| Tool | Input | Guardrails |
|---|---|---|
| `run_recipe` | `{ name, params? }` | a recipe by name; `run_id` defaults to the conversation's run, else the latest; parameters may also sit beside `name`; text parameters go through the literal guard |
| `find_entity` | `{ text, kind? }` | candidates over every spelling of any of the six kinds: exact, same ignoring case, then `pg_trgm` similarity over 0.3, each leg reaching an index. It proposes and picks none: a spelling still joins a thing only on a model's verdict. A row carries the first line of the thing's profile, so two similar names can be told apart by what they are. Also reports sender domains and subjects where the name appears |
| `find_entities` | `{ kind, description, candidateSql?, needComplete? }` | a term no column holds. Defines or reuses the concept, narrows by `candidateSql` (one column of ids, through `guardSql` and the literal guard), ranks, judges up to `JUDGE_BUDGET`, and returns the definition, the matches, the counts and a `joinSql` subquery to join on. Says `complete: false` with the deferred count rather than looking finished |
| `list_entities` | `{ kind, contains?, limit? }` | the things of a kind, or those with a spelling containing a word, which is how a country's ports are found |
| `get_entity` | `{ id }` | what it is, its attributes with where each came from, its profile, every spelling and how it joined, and its appearances by role. Follows a tombstone and says it did |
| `search_emails` | `{ text, runId?, limit? }` | `websearch_to_tsquery('simple', ...)` over `core.emails.search`, subject `ilike` as fallback, with a snippet |
| `profile_column` | `{ relation, column, near? }` | counts and the thirty most frequent values, or with `near` the thirty closest to a text, ranked by `public.similarity` (written in full: pg_trgm lives in `public`, off `retina_ro`'s search path). The column must exist in `pg_catalog` and be readable by the connection, and both names pass `safeIdentifier` before they are quoted |
| `load_skill` | `{ name }` | a skill's body and its recipes' signatures; it then stays with the conversation |
| `describe_schema` | `{ schema?, table? }` | `pg_catalog` through the RO pool, not `information_schema`, which holds no row for a materialised view and would report the whole `analytics` schema as empty |
| `run_sql` | `{ sql, purpose }` | `agents/chat/sql-guard.ts`, pure and table-tested: comments stripped first, must start with `select` or `with`, one statement, no `;` inside, a banned-word list as words, `limit 200` appended when the query ends without one, 200 rows and 20 kB out. Every ambiguity resolves towards refusal, a banned word inside a string literal included |
| `get_email` | `{ emailId, runId? }` | the trace summary. Without a run, the most recent one that processed the email |
| `explain_decision` | `{ emailId, runId? }` | the whole story in order, from `ontology/trace.ts`, the same assembly the trace page draws, so the chat and that page cannot tell a person different stories. Rationales come through the read-write pool because `retina_ro` is not granted them |

The guardrail is the second line of defence and not the first: `retina_ro` holds no write
privilege, defaults its transactions to read only and times out at 5 s. Two independent stops is
the right number when one of them is a regex over text a model wrote.

Turns are stored in `chat_turns`, tool calls and the result graph on the assistant turn. The same
tools are served over stdio by `backend/src/mcp.ts` from the same `TOOLS` registry, so a
teammate in Claude Code runs identical code against identical guardrails. `.mcp.json` at the
repository root configures it.

## 12. Eval harness

- `pnpm eval:split`: reads `ground_truth.json` (local path from `EVAL_GROUND_TRUTH_PATH`),
  stratifies by `(category, review_reason)`, writes `eval/split.json` with `train` and `holdout`
  id lists. Committed once and never regenerated unless the dataset changes.
- `pnpm eval:sample`: writes `eval/dev-sample.json`, 30 train ids (six per category). The subset a
  change is tried on before the holdout is read. Committed once.
- `pnpm eval:examples`: writes `agents/prompts/classify/examples.v4.json` from the `train` split,
  excluding the dev sample, and refuses any holdout id.
- `pnpm eval:score --run <id> [--holdout]`: builds the submission for the run from Postgres,
  scores it with `eval/score.ts` (port of `scoring.py`: stage1 macro-F1, stage3 defect-F1,
  end-to-end with exact set equality, reliability diagnostics), prints the scoreboard and a
  confusion matrix, writes `eval/reports/<run>.json`.
- `pnpm eval:diff --a <run> --b <run>`: emails whose outcome changed between two runs, for
  prompt comparison.
- The lesson gate calls `eval:score --holdout` before and after applying a candidate; a drop
  in `final_score` or in any single component blocks it.
- `pnpm eval:chat [--set ontology] [--limit N] [--tag T] [--ids a,b]`: runs a question set through
  the real chat loop. `chat` is 10d's set, about the work; `ontology` is 10f's, one question per
  class the semantic layer serves. Both are scored by `eval/chat-score.ts`, which is pure and
  measures behaviour a person could verify from the page, never prose against a reference
  sentence. The ontology set adds two numbers: recall and precision of the entity set against what
  `find_entities` returned (not against the answer's words), and how often a turn's completeness
  flag agreed with its own deferred count. Recall gates a question; precision is reported.
- `pnpm ontology:backfill [--limit N]`, `pnpm ontology:bench`, `pnpm ontology:export`: enqueue a
  reading for finished emails that have none, measure the layer at 200,000 things inside a
  rolled-back transaction, and write the profiles out as Markdown for a person to read. Nothing
  reads that folder back.

On the VPS, `ground_truth.json` reaches only the `inbox` container, which mounts it read-only
from the clone. `api` and `worker` never see it, and `EVAL_GROUND_TRUTH_PATH` is unset there.
`api` and `worker` cannot read it, so `/eval/*` routes are disabled there and scoring goes
through `POST /submit`.

## 13. Frontend

Pages (all behind the `proxy.ts` password gate; the cookie is an HMAC of `SITE_PASSWORD`, see section 3):

| Route | Content | Polling |
|---|---|---|
| `/login` | password form | |
| `/runs` | table of runs with score, the env concurrency, start-run form (dev sample, holdout, all 520 or first N; rate; optional prompt version and model) | 3 s |
| `/runs/[id]` | the two queues left to right, one panel per queue with a row per email holding a slot, and where they end up. Replaces its panels rather than emptying them: a held queue says what is holding it and when it retries, a finished run shows outcomes, what it took and the score | 2 s while live, not at all once `processingDone` |
| `/runs/[id]/emails/[emailId]` | the message as a bordered card, the seam, the reading in plain English, then the check. Tabs for `The check` (or `The case`), `Both documents` and `Model calls`, the `Links to` strip, and the action bar drawn for phase 8. The 340px chat column is present and inert | 3 s until the email's stage is terminal |
| `/review` | open cases grouped by reason, plus Failures tab; case detail with actions and upload | 3 s |
| `/chat` | conversations, messages, SQL shown in a collapsible block, result tables | on send |
| `/eval` | score history per run and prompt set; dev-only holdout view | 10 s |
| `/clients` | tier editor | |

`lib/api-client.ts` stays the only door to the backend. Server actions and route handlers call
it; client components never hold the secret. Polling uses SWR with `refreshInterval`.

## 14. Deployment changes

- `deploy/compose.yaml`: redis, minio, minio-init, worker and inbox are there as of phase 3;
  doc-extract joins in phase 5. `api` and `worker` share one env block so they cannot drift.
- `auto-deploy.sh`: after pulling or building the api image, also `docker compose build
  doc-extract` and `docker compose up -d api worker doc-extract`; health poll covers
  `/health` including the new dependency checks; rollback restores both api and worker images.
- The organiser kit lives in `emails/` and `ground_truth.json` is committed with it, as the
  organisers shipped it. Nothing places it on the box by hand: the clone has it, and compose
  mounts it into `inbox` and nothing else. `eval/` is the only code that may read it.
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
- One published port, `127.0.0.1:8091` (api). The inbox, Postgres, Redis and MinIO are private
  to the compose network; the MinIO console is reachable only through an SSH tunnel.
- Uploaded files: size cap 20 MB, extension allow-list, stored under a case-scoped key, parsed
  by doc-extract in the same sandbox as everything else.
- Secrets in `~/retina/.env`, never in the repo. Ground truth never in the repo.

## 16. Observability

- Structured JSON logs (pino) with `runId`, `emailId`, `stage`, `jobId` on every line.
- `core.llm_calls` is the LLM ledger: cost per run, per step, per prompt version, latency p50/p95.
- `GET /queues` and `run:{id}:counters` feed the dashboard; `docker compose logs -f worker`
  for the live view.
- `/health` returns per-dependency status and the worker heartbeat (worker writes
  `worker:heartbeat` to Redis every 10 s; api reports stale after 60 s). The TTL is six beats,
  not one: a worker that misses a cycle under load is still working, and auto-deploy reads this.
- The semaphore logs its peak whenever it rises (`model slots in flight`), which is how many
  model calls were ever in flight at once against the cap.
- Proxy spend by project at `http://llm-proxy:4000/admin/usage` inside the stack
  (`docker compose exec llm-proxy curl -s 127.0.0.1:4000/admin/usage`); set `X-Project:
  retina-worker` and `retina-chat` headers so it is split.

## 17. Failure modes

| Failure | Effect | Handling |
|---|---|---|
| llm-proxy down | classify and compare jobs fail with 503 | retryable; after 3 attempts the email is `failed` and shows under Failures; dashboard shows proxy red in `/health` |
| llm-proxy not logged in | every model call is `provider_not_logged_in` | permanent: each email fails at once naming `CLAUDE_CODE_OAUTH_TOKEN`; set it and `docker compose up -d llm-proxy`, then rerun |
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
6. `job.changePriority` behaves as expected on the installed BullMQ version. **Answered in
   phase 9: it works on 6.3.6, and it updates `job.priority` while leaving `job.opts.priority`
   at whatever the job was added with.**
7. Disk headroom on the box for MinIO plus page renders (estimate under 1 GB for 520 emails).
