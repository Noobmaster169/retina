# Phase 8: Review inbox

## Goal

The human-in-the-loop path is real: a reviewer sees every escalated case with its evidence,
confirms or corrects it, uploads a missing document, adds a note, and the report updates.
Processing failures become visible cases with a retry button. Every human action is stored as
a labelled example for phase 11.

## Prerequisites

Phase 7 merged: trace components exist and the review case shape is in the trace contract.

## Scope

In: `review_actions` table, action semantics and reruns, upload path, `processing_error`
cases from the queue `failed` handler, retry, review routes, `/review` page. Out: priority
controls, lesson drafting (phase 11 reads `review_actions`).

## Work items

### 1. Migration `007_review_actions.sql`

```sql
create table core.review_actions (
  id              bigserial primary key,
  review_case_id  bigint not null references core.review_cases(id) on delete cascade,
  email_run_id    bigint not null references core.email_runs(id) on delete cascade,
  kind            text not null check (kind in ('confirm','correct_field','reclassify','note','upload','retry','reopen')),
  field           text,
  side            text check (side in ('SI','BL')),
  old_value       text,
  new_value       text,
  note            text,
  actor           text not null,
  created_at      timestamptz not null default now()
);
create index on core.review_actions (email_run_id);
create index on core.review_actions (kind, created_at);

alter table core.attachments add column review_case_id bigint references core.review_cases(id);
alter table core.email_runs add column rerun_count int not null default 0;
```

`actor` is the reviewer name typed once into the UI and kept in `localStorage` (no user
accounts in this build); the API requires it non-empty.

### 2. Action semantics: `src/review/actions.ts`

Each action runs in one transaction, then optionally enqueues. All return the updated case.

| kind | Body | Writes | Then |
|---|---|---|---|
| `confirm` | `{ note? }` | action row; case `resolved`; `comparisons.decided_by = 'human'` | stage `done`, outcome stays (`NEEDS_REVIEW` is kept as the reported status; the human confirmed that escalation was right) |
| `correct_field` | `{ field, side, value, note? }` | action row with old and new; `extraction_fields.human_value` for that document and field | enqueue `compare` with `rerunFrom: "compare"`; case stays open until the rerun completes; the rerun closes it (`resolved_by = actor`) when the outcome is no longer an escalation, otherwise it stays open with the new reason |
| `reclassify` | `{ category, note? }` | action row; `classifications.human_category`, `decided_by = 'human'` | if new category is `BL_COMPARISON`: enqueue `compare` (`rerunFrom: "triage"`); else: `comparisons` upsert `OK` with `detail.reclassified = true`, `field_diffs` cleared, case resolved, stage `done` |
| `note` | `{ note }` | action row | none |
| `upload` | multipart `file`, `role` (`SI`/`BL`), `note?` | object under `uploads/{caseId}/{filename}`; `attachments` row with `origin = 'human'`, `role`, `review_case_id`; action row | enqueue `compare` with `rerunFrom: "triage"`; triage prefers human-origin attachments for a role over source ones |
| `retry` | `{ note? }` | action row; `email_runs.rerun_count + 1` | enqueue the failed stage's queue with `jobId` suffixed `:r{n}` and `rerunFrom` set to the failed stage (`classify` for classification failures) |
| `reopen` | `{ note }` | action row; case `open` | none |

The rerun processors check for an open case on completion: if the new outcome is `OK` or
`MISMATCH`, resolve the case (`resolved_by = last action actor`); if it is another escalation,
update the case `reason` and `detail` in place (no second open case, per the unique index).

Human values win everywhere: `toSideValues` uses `human_value ?? value`; the trace and
review views show a "human" marker on such fields.

### 3. Processing failures

`workers.ts` `failed` handler, final attempt only:

```
emailRuns.setStage(failed, error = message)
review_cases.upsert open case { reason: processing_error, stage: job.name, detail: { message, stack: first 5 lines, attempts, jobId } }
comparisons.upsert({ status: NEEDS_REVIEW, review_reason: processing_error })   # only when category is BL_COMPARISON or unknown
```

For classification failures the email has no category yet; the submission builder emits
`GENERAL` for it and lists it under `incomplete`. This is visible on the run page as
`failed`.

`TerminalError` skips retries (`job.discard()`), so terminal failures appear within seconds.

### 4. Routes

| Route | Purpose |
|---|---|
| `GET /review?status=open&reason=&runId=&page=` | cases with email summary, reason, opened_at, age, last action |
| `GET /review/:id` | case plus the full trace (reuses the trace builder) plus actions |
| `POST /review/:id/actions` | `{ kind, actor, ...fields }` validated per kind with a zod discriminated union |
| `POST /review/:id/upload` | multipart (`multer` memory storage, 20 MB cap, extension allow-list `txt pdf docx xlsx`) with `actor`, `role`, `note` fields |
| `GET /review/stats` | open by reason, resolved today, median time to resolve |

Upload validation: content sniff for PDF (`%PDF`), DOCX/XLSX (zip magic `PK`), TXT (utf-8
decodable); mismatch → 400.

### 5. Frontend `/review`

Layout: left list, right detail.

- List: grouped tabs by reason (`unreadable`, `wrong_doc_type`, `missing_attachment`,
  `missing_value`, `low_confidence`) plus a `Failures` tab (`processing_error`); each row:
  email id, subject, run, age, reason chip. Filter by run. Polling 3 s.
- Detail: the escalation banner and the trace sections from phase 7, then an action bar:
  - Confirm (with optional note)
  - Correct field: field selector, side selector, value input prefilled with current value,
    quote shown for context; submit → spinner until the rerun finishes (poll the case)
  - Reclassify: category selector
  - Add note
  - Upload: drop zone, role selector; visible for `missing_attachment`, `unreadable`,
    `wrong_doc_type`
  - Retry: visible for `processing_error`
- Actions history under the bar with actor and timestamp.
- Reviewer name prompt on first visit, stored locally, editable in the nav.

### 6. Tests

- `review/actions.test.ts`: each action's writes and enqueue calls with a fake queue; a
  `correct_field` rerun that resolves the case; a rerun that re-escalates updates the case in
  place; `reclassify` to non-comparison clears diffs.
- `queues/workers.test.ts`: final failure creates a `processing_error` case; `TerminalError`
  creates it after one attempt.
- `routes/review.test.ts`: validation per kind; upload rejects wrong magic bytes and oversize;
  upload stores under the case key and enqueues.
- `pipeline/compare/triage.test.ts` addition: human-origin BL preferred over source BL.

### 7. Manual verification

Run the full inbox, then in `/review`:

1. `missing_value` case (516 to 520): correct the blank SI weight with the BL value → case
   resolves, status `OK` (or `MISMATCH` if another field differs); the submission now reflects it.
2. `missing_attachment` case with SI only (506, 508 or 510): upload the matching BL from the
   dataset for a comparable email → full comparison appears.
3. `wrong_doc_type` case: confirm → resolved, status stays `NEEDS_REVIEW`.
4. Stop `doc-extract`, start a small run (limit 20) → `processing_error` cases appear within
   the retry window; start doc-extract; retry → cases resolve.
5. Reclassify a `GENERAL` email to `BL_COMPARISON` (no attachments) → ends `awaiting_draft`.

## Exit checklist

- [ ] Correcting a weight on a `missing_value` case re-runs the comparison and the case closes with the new status.
- [ ] Uploading a BL to a `missing_attachment` case produces a full comparison.
- [ ] Stopping doc-extract mid-run creates `processing_error` cases; retry after restart clears them.
- [ ] Submission after review reflects human decisions (`decided_by` and values).
- [ ] Every action is in `review_actions` with actor and old/new values.
- [ ] A second escalation on the same email updates the open case; there is never more than one open case per email run.

## Hand-off notes for phase 9

- `review_actions` is the raw material for lesson drafting in phase 11; keep `note` free text.
