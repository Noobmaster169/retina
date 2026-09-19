# Phase 7: Dashboard and email trace

## Goal

A person can watch a run and understand any single decision without SQL: what arrived, where
it is, what the rules said, what the model said, what was extracted and from which line, what
differed, and why something was escalated.

## Prerequisites

Phase 6 merged. All data the pages need already exists in Postgres and MinIO.

## Scope

In: trace contract and route, queue and counter routes, file streaming, run page rebuilt,
email trace page, polling hooks, shared components. Out: any write action from the UI (phase 8),
priority controls (phase 9), chat (phase 10).

## Work items

### 1. Redis counters

Worker increments `run:{runId}:counters` (hash) on stage transitions: `ingested`,
`classified`, `compared`, `review`, `done`, `failed`, plus `llm_calls` and `llm_cost_micros`.
`GET /runs/:id` reads the hash for live numbers and falls back to `stageCounts` from Postgres
when the hash is missing (after a Redis restart). Counters expire 7 days after the run
finishes.

### 2. Routes

`GET /runs/:id` (extended) returns:

```ts
{
  ...RunSummary,
  counters: { ingested, classified, compared, review, done, failed },
  categories: Record<Category, number>,
  outcomes: { ok: number; mismatch: number; review: Record<ReviewReason, number>; awaitingDraft: number },
  defectFields: Record<Field, number>,
  llm: { calls, inputTokens, outputTokens, costUsd, ruleShare, verifierShare, extractVerifierShare },
  throughput: { emailsPerMinute: number; lastMinute: number },   // from email_runs.finished_at buckets
  lastSubmission: { finalScore, createdAt } | null
}
```

`GET /runs/:id/feed?after=<iso>` returns the last 50 `email_runs` that changed stage after
the timestamp (`emailId, subject, stage, outcome, category, updatedAt`). `email_runs` gains
`updated_at` (migration `006_updated_at.sql` with a trigger or explicit writes in
`setStage`).

`GET /queues` returns `{ classify: {waiting, active, delayed, failed}, compare: {...}, ingest: {...}, worker: { heartbeatAt } }`.
Heartbeat: worker writes `worker:heartbeat` every 10 s (phase 9 formalises health; write the
key now).

`GET /emails/:runId/:emailId` returns the trace:

```ts
{
  email: { emailId, from, senderDomain, subject, body, bodyClean, tonnageMt, receivedAt },
  run: { id, stage, outcome, priority, attempt, startedAt, finishedAt },
  attachments: [{ id, filename, role, origin, contentType, bytes, sha256, fileUrl, textUrl | null, pages: number | null }],
  classification: { rule: { category, confidence, reasons }, generator: { category, confidence, rationale } | null,
                    verifier: { category, agreesWith, confidence, rationale } | null,
                    final: { category, decidedBy, humanCategory, promptVersion } } | null,
  documents: [{ id, attachmentId, role, docType, format, scanned, unreadable, warnings, pages }],
  extractions: [{ documentId, role, method, promptVersion,
                  fields: [{ field, value, placeholder, sourceQuote, confidence, evidenceOk, harvestValue, harvestAgrees, verified, normalised, humanValue, note }] }],
  comparison: { status, reviewReason, hasDefect, decidedBy, detail,
                diffs: [{ field, siValue, blValue, siNormalised, blNormalised, judgeUsed, judgeConfidence }] } | null,
  reviewCase: { id, reason, stage, detail, status, openedAt, resolvedAt, resolvedBy, actions: [] } | null,
  llmCalls: [{ id, step, model, promptVersion, ok, latencyMs, inputTokens, outputTokens, costUsd, createdAt }],
  timeline: [{ at, event, detail }]     // derived: ingested, classified (decided_by), compare stages, escalation, done
}
```

`GET /llm-calls/:id` returns the full `request` and `response` for one call (used by the
"show prompt" expander; kept off the main trace payload for size).

`GET /files/*key`: bearer-protected stream from MinIO with `Content-Type`,
`Content-Disposition: inline; filename=...`, and `Cache-Control: private, max-age=300`. Only
keys under `runs/`, `uploads/`, `submissions/` are allowed. `fileUrl` and `textUrl` in the
trace are frontend route-handler URLs (`/api/files/...`) that proxy to this route so the
browser never sees the backend URL or secret.

`POST /emails/:runId/:emailId/render` triggers `docExtract.render` for PDF attachments that
have no page images yet and returns the page keys. The trace page calls it lazily when the
"Pages" tab opens.

### 3. Frontend structure

```
frontend/
  app/(gated)/layout.tsx               nav: Runs, Review (phase 8), Chat (phase 10), Eval (phase 11), Clients (phase 9)
  app/(gated)/runs/page.tsx
  app/(gated)/runs/[id]/page.tsx
  app/(gated)/emails/[runId]/[emailId]/page.tsx
  app/api/**/route.ts                  thin proxies to api-client
  components/
    stat-tile.tsx  stage-funnel.tsx  category-bars.tsx  defect-field-bars.tsx
    live-feed.tsx  score-card.tsx  queue-badges.tsx
    email-table.tsx  filters.tsx  pagination.tsx
    trace/
      email-header.tsx  classification-panel.tsx  attachment-viewer.tsx
      extraction-table.tsx  comparison-table.tsx  escalation-banner.tsx
      llm-calls-list.tsx  timeline.tsx  highlighted-text.tsx
  lib/api-client.ts  lib/hooks.ts (useRun, useFeed, useQueues, useTrace)  lib/format.ts
```

Polling with SWR: run page 2 s (`useRun`, `useFeed`, `useQueues`), runs list 5 s, trace page
no polling except when `stage` is not terminal (then 3 s).

### 4. Run page `/runs/[id]`

Sections, top to bottom:

1. Header: run id, status, rate, started, controls (pause, resume, cancel, submit).
2. Stat tiles: ingested, classified, compared, needs review, done, failed; LLM calls, cost,
   verifier share; throughput per minute; queue badges (waiting/active per queue).
3. Stage funnel (ingested → classified → compared → done) with review and failed as side bars.
4. Category bars and outcome bars (OK, MISMATCH, review by reason, awaiting draft).
5. Defect field bars.
6. Score card (last submission, history link).
7. Live feed: newest 50 stage changes, each linking to the trace page.
8. Email table with filters (stage, category, status, review reason, search on subject or id),
   pagination, columns: id, from, subject, category, decidedBy, stage, status, defect fields.

### 5. Trace page `/emails/[runId]/[emailId]`

1. Header: subject, from, sender domain, tonnage, stage badge, outcome badge, timeline strip.
2. Escalation banner when a review case exists: reason, human-readable explanation, detail
   (missing fields, wrong doc evidence, page thumbnails for unreadable, provisional result
   for scans).
3. Classification panel: three columns (rule, generator, verifier) with category, confidence,
   reasons or rationale; final category and `decidedBy`.
4. Attachments: tabs per file; each with Original (download or inline for txt), Text (extracted
   text with highlighted quotes), Pages (PNG thumbnails, lazily rendered). Role and doc type
   badges; warnings.
5. Extraction table: rows = seven fields; columns = SI value, SI quote, BL value, BL quote,
   confidence, evidence ok, harvest agrees, verified; clicking a quote scrolls the Text tab to
   the highlighted line. Human values shown with a marker.
6. Comparison table: rows = fields; SI vs BL side by side; differing rows marked; judge
   confidence when used; "No mismatch detected" when the status is OK.
7. LLM calls list: step, model, prompt version, tokens, cost, latency, expander that fetches
   `/llm-calls/:id` and shows request and response JSON.
8. Body: cleaned body by default, toggle to raw.

`highlighted-text.tsx`: given text and a list of quotes, find each quote (whitespace-normalised
search over a normalised copy with an index map back to original offsets) and wrap in `<mark>`
with a per-field colour token; unresolved quotes listed as "not found".

### 6. Contracts

All response types added to `contracts.ts` and mirrored in `api-client.ts`. Frontend route
handlers validate nothing (they proxy) but the client parses with the mirrored zod schemas in
development to catch drift (`if (process.env.NODE_ENV !== "production") schema.parse(json)`).

### 7. Tests

- Backend: `routes/trace.test.ts` builds a full trace for a seeded email_run (repository
  fixtures) and asserts shape; `routes/files.test.ts` rejects keys outside allowed prefixes
  and unauthenticated calls; `feed` respects `after`.
- Frontend: `highlighted-text.test.tsx` (vitest + testing-library): finds quotes across
  whitespace differences, handles missing quotes; `format.test.ts` for number and duration
  formatting. Keep frontend tests to pure helpers and this one component.

### 8. Manual verification

- Start a run at 2 emails/s; the funnel, tiles and feed move without reload; queue badges
  show non-zero waiting during the run.
- Open a mismatch trace (any `MISMATCH` row): comparison table marks the right fields; clicking
  an SI quote highlights the line in the SI text tab.
- Open 512 (scanned): banner shows page thumbnails and the provisional result.
- Open 503 (wrong doc): banner shows detected type and the title evidence.
- Browser devtools network tab: only same-origin `/api/*` requests; no bearer header, no
  ngrok host.

## Exit checklist

- [ ] During a 2 emails/s run the funnel, tiles, queue badges and feed update without page reloads.
- [ ] Every trace section renders for: an OK email, a MISMATCH, each of the five review reasons, an awaiting-draft email, a spam email (classification only).
- [ ] Quotes highlight correctly for txt, pdf, docx and xlsx documents.
- [ ] Page images render for a scanned PDF and for a regular PDF on demand.
- [ ] No secret or backend URL appears in browser requests.
- [ ] `pnpm build` in `frontend/` passes; backend tests pass.

## Hand-off notes for phase 8

- The trace components are reused as-is inside the review case view; phase 8 adds an action
  bar and upload form below them.
