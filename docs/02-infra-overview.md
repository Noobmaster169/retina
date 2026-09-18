# Retina SDOC: Infrastructure overview

How the pieces fit, where each one runs, and how data moves. Details (schemas, queue settings,
prompts, routes) are in `03-infra-deep.md`.

## 1. One picture

```
                 Vercel                                    Monash VPS (firewall: no inbound)
┌──────────────────────────┐        ┌────────────────────────────────────────────────────────────┐
│ frontend (Next.js)       │        │  ngrok agent ──▶ api (Express :8091)                        │
│  dashboard, review, chat │──HTTPS─┼──▶ ngrok cloud    │  routes, auth, enqueue, read models     │
│  polls every 2-3 s       │        │                   │                                         │
└──────────────────────────┘        │                   ├──▶ postgres (core + analytics schemas)  │
                                    │                   ├──▶ redis (BullMQ queues, priority cache)│
                                    │                   ├──▶ minio (attachments, pages, text)     │
                                    │                   └──▶ llm-proxy :4000 (chat agent)         │
                                    │                                                            │
                                    │  worker (same image, different entrypoint)                 │
                                    │   ├─ classify queue consumer ─┐                            │
                                    │   ├─ compare queue consumer  ─┼──▶ llm-proxy ──▶ claude -p  │
                                    │   ├─ ingest replay controller │              └▶ Ollama/Qwen │
                                    │   └─ scheduled jobs           │                            │
                                    │        │                      └──▶ doc-extract (Python)    │
                                    │        └──▶ averis server :8080 (emails, attachments,      │
                                    │             POST /submit scorer, answer key mounted        │
                                    │             privately, never reachable from outside)       │
                                    └────────────────────────────────────────────────────────────┘
```

## 2. Components

| Component | Runs | Tech | Purpose | Talks to |
|---|---|---|---|---|
| frontend | Vercel | Next.js | Dashboard, email trace, review inbox, chat, eval page. Password gate. | api (server side only, via ngrok) |
| api | VPS, compose | Express, TypeScript | Only public entry point. Auth, run control, read models, review actions, chat agent loop, presigned file URLs, scorer submission. | postgres, redis, minio, llm-proxy, averis |
| worker | VPS, compose | Same image as api, `node dist/worker.js` | Consumes both queues, runs the ingest replay, runs scheduled jobs (priority cache refresh, analytics refresh, aging). | postgres, redis, minio, llm-proxy, doc-extract, averis |
| doc-extract | VPS, compose | FastAPI, PyMuPDF, python-docx, openpyxl, tesseract | Turns any attachment into text plus page images. Reports unreadable files. | minio (reads bytes) |
| postgres | VPS, compose | Postgres 17 | `core` schema: normalised writes. `analytics` schema: star-schema views. Read-only role for the chat agent. | |
| redis | VPS, compose | Redis 7, AOF, noeviction | Two BullMQ queues, client priority cache, small counters. | |
| minio | VPS, compose | MinIO | S3-compatible bucket: raw attachments, rendered pages, extracted text, reviewer uploads. | |
| averis | VPS, compose (their file, port bound to localhost) | FastAPI | Dataset source and self-scoring endpoint. | |
| llm-proxy | VPS, existing, shared with yt-engine | uvicorn on `172.17.0.1:4000` | One door to Claude (subscription) and Qwen (local GPU). | claude CLI, Ollama |
| ngrok | VPS, existing pattern | ngrok agent | Outbound tunnel that publishes `127.0.0.1:8091` on a static hostname. | api |

## 3. Network boundaries

Three rings. Nothing crosses inward except through the ring's one door.

| Ring | What is there | Door |
|---|---|---|
| Public internet | Vercel app URL, ngrok hostname | Password gate on the page; bearer key on the API |
| Compose private network | api, worker, doc-extract, postgres, redis, minio, averis | Only api is exposed, and only on `127.0.0.1:8091` for ngrok |
| Host | llm-proxy on the Docker bridge, Ollama on localhost | Reached by containers through `172.17.0.1`; never bound wider |

The Averis container's port mapping must be `127.0.0.1:8080:8000`, not `8080:8000`. It holds the
answer key. The api and worker reach it by service name on the compose network.

## 4. Flows

### 4.1 The pipeline (ingest, classify, compare, store)

```
[replay controller]   every 1/rate seconds:
  1. GET email from averis
  2. INSERT core.emails, core.email_runs(stage=ingested)
  3. copy attachments to minio, INSERT core.attachments
  4. add job to queue "classify" {runId, emailId}, priority from redis cache

[classify worker]
  5. rules  -> {category, confidence, reasons}
  6. LLM generator (sees rule hint) -> {category, confidence, rationale}
  7. if disagree or low confidence: LLM verifier -> {agree, category, rationale}
  8. INSERT core.classifications, core.llm_calls; email_runs.stage=classified
  9. if BL_COMPARISON: add job to queue "compare" {runId, emailId}
     else: email_runs.stage=done, outcome OK

[compare worker]
 10. attachment triage: count, roles, was a comparison actually requested
 11. doc-type fingerprint on each file
 12. doc-extract -> text, pages, unreadable flag
 13. LLM extraction per document -> 7 fields with source_quote + confidence
 14. evidence check (quote in text); if fails: LLM verifier re-reads
 15. normalise + deterministic compare; LLM party judge only if names still differ
 16. decide: OK | MISMATCH(fields) | NEEDS_REVIEW(reason)
 17. INSERT documents, extractions, comparisons, field_diffs, review_cases as needed
 18. email_runs.stage=done
```

Every step writes before it enqueues. Job payloads carry ids only. Job ids are
`${runId}:${emailId}`, so a retry can never create a duplicate.

### 4.2 Browser to dashboard

```
browser -> Next.js server action -> https://<ngrok>/runs/:id/summary (Bearer API_SHARED_SECRET)
        -> api reads postgres + redis queue counts -> JSON -> page re-renders
```
Repeats every 2 to 3 seconds. Each request is short, so Vercel's 300 s limit and ngrok's free
tier are never stressed. The browser never sees the ngrok URL or the secret.

### 4.3 Review action

```
reviewer clicks "correct field" -> api PATCH /review/:id
  -> INSERT core.review_actions, UPDATE extraction_fields (human value)
  -> add job to "compare" with {runId, emailId, rerunFrom: "compare"}
  -> worker re-runs steps 15-18 using the human value
  -> report updates; the correction is now a labelled example
```

### 4.4 Chat question

```
user asks -> api POST /chat/:conversationId/messages
  -> agent loop via llm-proxy with tools:
       describe_schema, run_sql (read-only role, LIMIT, 5 s timeout),
       get_email, explain_decision
  -> answer + the SQL it ran -> stored in core.chat_turns -> returned to page
```
Non-streaming. One request per turn.

### 4.5 Score a run

```
"Submit" -> api builds submission JSON from core tables for the run
         -> POST averis:/submit -> scoreboard -> INSERT core.submissions
         -> dashboard shows score next to earlier runs
```
The eval harness does the same offline against `ground_truth.json` on the holdout split, and
never runs inside the pipeline.

### 4.6 Deploy

```
push to main -> GitHub Actions type-checks and publishes the api image
             -> auto-deploy.sh on the VPS (every 3 min) fast-forwards, rebuilds or pulls,
                recreates api, worker, doc-extract; polls /health; rolls back on failure
frontend: Vercel deploys every push to main
```

## 5. Where data lives

| Data | Store | Why there |
|---|---|---|
| Emails, classifications, extractions, comparisons, review cases, LLM calls, scores | postgres `core` | Source of truth, relational, auditable |
| Aggregates by client, run, category, day | postgres `analytics` (views, refreshed on schedule) | Fast dashboard and chat queries |
| Queued and in-flight jobs | redis (BullMQ) | Ordering, priority, retries, concurrency |
| Client priority map | redis hash | Sub-millisecond lookup at enqueue time |
| Raw attachments, page PNGs, extracted text, reviewer uploads | minio | Immutable blobs, presigned links for the UI |
| Dataset and answer key | averis container | Organiser-provided, read-only to us |

## 6. Principles

1. **Database first, queue second.** An email exists in Postgres before any job references it.
2. **Ids in jobs, content in the database.** Jobs are tiny and safe to retry.
3. **Idempotent by construction.** Job id = run + email. Re-running a stage overwrites that stage's rows for that run.
4. **Rules before models.** Deterministic code decides whatever it can, and records that it did.
5. **Models extract, code compares.** The scorer needs exact field sets; an LLM never emits the final diff list.
6. **Every value carries evidence.** Extracted fields quote their source line.
7. **Uncertainty is a separate axis from difference.** Blank, unreadable, and wrong-document cases escalate; they are never mismatches.
8. **Everything is versioned.** `run_id` on every row, `prompt_version` on every LLM call, lessons with version history.
9. **Failures are visible.** A job that exhausts retries becomes a review case with the error, not a silent entry in a Redis set.
10. **The answer key is quarantined.** Only the eval harness reads it; api and worker containers never mount it.

## 7. Environments

| | Local dev machine | VPS |
|---|---|---|
| Postgres | compose.local.yaml, port 5433 | compose service, private |
| Redis, MinIO, doc-extract, averis | same compose.local.yaml | compose services |
| llm-proxy | `~/ai/tools/llm-proxy` on 127.0.0.1:4000, or `test` alias | shared proxy on 172.17.0.1:4000 |
| api, worker | `pnpm dev`, `pnpm dev:worker` | compose services |
| frontend | `pnpm dev` on :3000, `BACKEND_URL=http://localhost:8091` | Vercel |
| Scoring | `score_cli.py` on the holdout, or local averis `/submit` | averis `/submit` only |

## 8. Constraints that shape decisions

| Constraint | Consequence |
|---|---|
| Vercel functions stop at 300 s | Frontend never waits on the pipeline; it starts runs and polls |
| ngrok free tier: one static domain per account, connection limits, possible buffering | Polling instead of SSE; a second ngrok account for retina |
| Firewall blocks inbound | Pull-based deploys, outbound tunnel |
| Around 8 parallel `claude -p` calls | Worker concurrency 4 per queue, one worker replica, adjustable by env |
| Proxy predates Qwen `reasoning_effort` passthrough | Sonnet for every role now; Qwen aliases when the proxy is upgraded |
| Proxy image passthrough unverified | OCR is the guaranteed path for scans; vision is additive |
| Answer key present on the box | Eval-only, never mounted into pipeline containers |
| Judges may use a fresh seed | Rules must derive from content, never from email ids |
