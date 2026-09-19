# Phase 5: Document parsing and triage

## Amended 2026-09-19: the model decides what a document is

This governs wherever the work items below disagree with it.

- **No fingerprint table.** Work item 5 matched document titles and labels in code. That is a
  rule fitted to this dataset's renderer. Document type is an LLM call (`prompts/doc-type/v1.md`,
  `sonnet`) over the extracted text; see `03-infra-deep.md` 5.3. `fingerprint.ts` is not built.
- **Triage** already reads the email through the model for the no-attachment case (work item 4).
- The three escalations keep the organisers' reasons, value for value: `missing_attachment`,
  `wrong_doc_type`, `unreadable`. `unreadable` stays a fact from doc-extract (no text layer, will
  not open, zero bytes), which is not a judgement and needs no model.
- When this phase starts, rewrite work items 5 and 6 and the tests under this section first.

## Goal

Every attachment becomes text (or is declared unreadable), the SI and BL are identified by
content as well as filename, and the three structural escalations exist: `missing_attachment`,
`wrong_doc_type`, `unreadable`. No field extraction yet; comparable pairs still end `OK` as a
placeholder.

## Prerequisites

**Read `phase-05-handover.md` first.** Phase 4 changed what several items below land on:
the migration is `005`, not `004`; new LLM steps must be wired into the prompt pinning; the
compare worker needs the LLM outage policy; the run summary must count `review` as finished; the
proxy is a compose service with no tools.

Phase 4 merged. Python 3.12 locally. Docker for the doc-extract image.

## Scope

In: `services/doc-extract` (all four formats, OCR, page rendering), `DocExtractClient`,
triage, doc-type (the model), `documents` and `review_cases` tables, escalation module, compose wiring
(local and VPS), review counts on the run page. Out: LLM extraction, comparison, review UI.

## Facts about the data that drive this phase

From the generator (`render.py`, `edgecases.py`, `generate.py`):

| Format | How it is laid out | Consequence |
|---|---|---|
| `.txt` | `Label: value` lines; addresses on the next line indented two spaces; ports carry `(CODE)` | line-based parsing works |
| `.pdf` (reportlab) | Label drawn at x=20 mm, first value line at x=60 mm on the same baseline, further address lines below; a per-container weight table; then `Label: N x 40'HC` and `TOTAL Label: W KG` lines; ports without codes; SI title is `BILL OF LADING INSTRUCTION`, BL title `BILL OF LADING (DRAFT)`; both carry a `B/L NUMBER: ... BOOKING NO. ...` line | rebuild lines from word coordinates, not from the default text order; do not use the per-container table for totals |
| `.docx` (BL only) | heading `BILL OF LADING (DRAFT)`, paragraph `B/L NO.(提单号): ...`, two-column table with labels like `Consignee (收货人)`, weight without unit | flatten table rows to `label: value`; keep CJK glosses |
| `.xlsx` | rows `[label, value]`; A1 is the shipper name alone; title row `BL INSTRUCTION` (SI) or `BILL OF LADING` (BL); weight is a numeric cell | row-based flattening; numeric cells rendered without separators |
| image-only `.pdf` | text rasterised at ~150 dpi with slight rotation and a grey watermark; both SI and BL are images | OCR works; the document still counts as `unreadable` for escalation (see policy below) |
| empty file | 0 bytes, `.pdf` extension | unreadable |
| garbled `.pdf` | valid header, random bytes, no xref | fails to open; unreadable |
| wrong doc | `.txt` whose first line is `COMMERCIAL INVOICE`, `PACKING LIST` or `CERTIFICATE OF ORIGIN` | the doc-type model reads it as one |

Body phrasing (all `BL_COMPARISON`):

| Situation | Body says | Attachments |
|---|---|---|
| comparable pair | "Please find attached the shipping instruction and the draft bill of lading ... Kindly verify" / "Attached are the SI and draft BL ... Please check" / "Pls assist to check the draft BL against the SI ... revert with any discrepancy" | SI + BL |
| awaiting draft | "Please assist to send the draft BL for ... for checking asap." | none |
| missing attachment | "Please compare the SI and draft BL for ... and confirm (the draft BL is still missing)" or "(attachments appear to have been dropped)" | SI only, or none |
| wrong doc type | "Please find attached the SI and the Packing List ... (Note: the second attachment is a Packing List, not the draft BL.)" | SI + wrong |
| unreadable | "Attached SI and draft BL ... (scanned copies (image only))" / "(the BL file appears to be empty)" / "(the BL file will not open)" | SI + BL |
| missing value | "Some SI fields were left blank by the customer; kindly confirm what we have." | SI + BL |

Rules must key on the structure (verbs, attachment presence, file content), not on the exact
sentences, because a fresh seed reuses the templates but a real inbox will not.

## Work items

### 1. `services/doc-extract/`

```
services/doc-extract/
  app.py                 FastAPI app, routes, error handling
  settings.py            pydantic-settings: MINIO_*, OCR_LANGS, OCR_DPI, RENDER_DPI
  models.py              pydantic request/response models
  storage.py             MinIO get/put
  registry.py            content type / extension -> extractor
  extractors/
    base.py              Extracted dataclass, helpers (line rebuild, placeholders)
    txt.py  pdf.py  docx.py  xlsx.py
    ocr.py               tesseract wrapper
  tests/
    fixtures/            email_004_SI.txt, one pdf pair, one docx, one xlsx, email_512_SI.pdf (image), email_511_BL.pdf (garbled), empty.pdf
    test_*.py
  Dockerfile  requirements.txt  pyproject.toml (ruff config)
```

`requirements.txt`: `fastapi`, `uvicorn[standard]`, `pydantic-settings`, `minio`, `pymupdf`,
`python-docx`, `openpyxl`, `pytesseract`, `pillow`.

Dockerfile: `python:3.12-slim`, `apt-get install -y tesseract-ocr tesseract-ocr-chi-sim`,
pip install, `uvicorn app:app --host 0.0.0.0 --port 8000`, healthcheck on `/healthz`.

Routes:

| Route | Request | Response |
|---|---|---|
| `GET /healthz` | | `{ ok: true, tesseract: "5.x", langs: ["eng","chi_sim"] }` |
| `POST /extract` | `{ key, content_type?, filename }` | `ExtractResponse` |
| `POST /render` | `{ key, filename, out_prefix, dpi? }` | `{ pages: [{ index, key, width, height }] }` |

`ExtractResponse`:

```python
class Page(BaseModel):
    index: int
    text: str
    source: Literal["text_layer", "ocr", "none"]
    ocr_confidence: float | None

class ExtractResponse(BaseModel):
    format: Literal["txt", "pdf", "docx", "xlsx", "unknown"]
    text: str                      # pages joined with "\f"
    pages: list[Page]
    unreadable: bool
    scanned: bool                  # any page came from OCR
    warnings: list[str]
    bytes: int
```

Extractor behaviour:

- `txt.py`: decode utf-8, fallback cp1252, `errors="replace"`; normalise line endings.
- `pdf.py`: open with PyMuPDF inside try; open failure → `unreadable`, warning with the
  exception message. Per page: `words = page.get_text("words")`; group by baseline
  (`round(y1)` within 2 pt), sort by x, join with single spaces → lines; join lines with `\n`.
  If a page yields fewer than 20 characters, render at `OCR_DPI` (220) grayscale and call
  `ocr.py`; page `source = "ocr"`. `scanned = any(source == "ocr")`.
- `ocr.py`: `pytesseract.image_to_data(img, lang=OCR_LANGS, config="--psm 6")`; text =
  words joined per line (group by `block_num, par_num, line_num`); confidence = mean of
  `conf > 0`; if `chi_sim` is missing at runtime, fall back to `eng` and add a warning.
- `docx.py`: headings and paragraphs in order; each table row → `cell0: cell1` with internal
  newlines replaced by ` | `.
- `xlsx.py`: first sheet (all sheets if more than one, separated by `\f`); each row → `A: B`
  when both non-empty, `A` when only the first, skip empty rows; numbers via `str()` (no
  separators, ints not floats when integral).
- Unreadable rule (applied in `app.py`, as built): `bytes == 0`, or open failed, or no pages, or
  no page anything can be worked from, or total text under 40 characters. A page can be worked
  from when it yielded text and, where that text came from OCR, tesseract's mean word confidence
  reached 40. Asking it per page and then over the document subsumes the "every page is `none`"
  and "every page is OCR under 40" clauses and closes the case they both missed: a blank page
  beside a page OCR could not read.
- Every extractor is wrapped: unexpected exceptions become `unreadable: true` with the
  exception in `warnings`, HTTP 200. HTTP 5xx only for MinIO failures (retryable).

`/render`: PyMuPDF `get_pixmap(dpi=RENDER_DPI)` per page, PNG to MinIO under `out_prefix/{n}.png`.
For non-PDF formats returns `pages: []`.

Extracted text is also written to MinIO at `.../text/{filename}.txt` by the worker (not by the
service) so the service stays stateless.

### 2. `DocExtractClient`: `src/doc-extract/`

```ts
export interface DocExtractClient {
  extract(req: { key: string; filename: string; contentType?: string }): Promise<ExtractResponse>;
  render(req: { key: string; filename: string; outPrefix: string; dpi?: number }): Promise<RenderResponse>;
}
```

`http.client.ts`: `fetch` with 60 s timeout for extract, 120 s for render; 5xx and timeouts →
`RetryableError`; response validated with zod (`ExtractResponse` schema mirrors the pydantic
model). `__fakes__/memory.client.ts`: map from key to canned response.

### 3. Migration `004_documents_reviews.sql`

```sql
create table core.documents (
  id              bigserial primary key,
  email_run_id    bigint not null references core.email_runs(id) on delete cascade,
  attachment_id   bigint not null references core.attachments(id) on delete cascade,
  role            text not null check (role in ('SI','BL','OTHER')),
  doc_type        text not null check (doc_type in ('SI','BL','SI_OR_BL','INVOICE','PACKING_LIST','COO','UNKNOWN')),
  format          text not null,
  text_object_key text,
  pages           int not null default 0,
  scanned         boolean not null default false,
  unreadable      boolean not null default false,
  warnings        jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  unique (email_run_id, attachment_id)
);

create table core.review_cases (
  id            bigserial primary key,
  email_run_id  bigint not null references core.email_runs(id) on delete cascade,
  -- 'review' carries one of the organisers' four reasons. 'failure' (a job that failed for good,
  -- phase 8) carries none: a failure is not a review_reason.
  kind          text not null default 'review' check (kind in ('review','failure')),
  reason        text check (reason in ('wrong_doc_type','missing_attachment','unreadable','missing_value')),
  check ((kind = 'review') = (reason is not null)),
  stage         text not null,
  detail        jsonb not null default '{}'::jsonb,
  status        text not null default 'open' check (status in ('open','resolved')),
  opened_at     timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   text
);
create index on core.review_cases (status, reason);
create unique index review_cases_one_open on core.review_cases (email_run_id) where status = 'open';
```

### 4. Triage: `src/pipeline/compare/triage.ts` (pure)

```ts
export interface TriageInput { request: "send_draft" | "compare_documents" | null; attachments: { filename: string; role: "SI"|"BL"|"UNKNOWN"; bytes: number }[] }
export type TriageResult =
  | { kind: "compare"; si: string; bl: string; extras: string[] }
  | { kind: "awaiting_draft"; note: string }
  | { kind: "missing_attachment"; missing: ("SI"|"BL")[]; note: string }
```

Which attachments are present is a fact, and code decides on it. What the sender is asking for is
a reading of the email, and the model decides that: there are no verb lists or regexes over the
body, for the same reason there are no classification rules (see phase 2).

| SI present | BL present | Decided by | Result |
|---|---|---|---|
| yes | yes | code | `compare` |
| yes | no | code | `missing_attachment` [BL] |
| no | yes | code | `missing_attachment` [SI] |
| no | no | the model (`prompts/triage/v1.md`) | `awaiting_draft` or `missing_attachment` [SI, BL] |

The triage prompt states the organisers' distinction (README, "Attachments" and "Edge cases"): a
request to send the draft BL has nothing to compare yet and is `OK`; a request to compare
documents that did not arrive is `missing_attachment`. It receives the full body, length-capped
only, and answers `{ request: "send_draft" | "compare_documents", confidence, rationale }` through
`callStructured`. `triage.ts` stays pure: it takes that answer as an input, and the processor
makes the call only for the no-attachment row.

Roles: filename role first; `UNKNOWN` files take the model's word after parsing (work item 5,
`resolveRoles`). More than one file per role: keep the first, list
the rest in `extras`.

### 5. Document type: `src/agents/doc-type.ts` (the model, not a fingerprint)

Rewritten 2026-09-20 under the amendment above, as built.

One `callStructured` call per readable document, `prompts/doc-type/v1.md` on `sonnet`. Input:
the file name, the role the filename claims (as a claim to check), and the extracted text cut at
`DOC_TYPE_TEXT_CHARS`. Output `{ rationale, doc_type: SI | BL | INVOICE | PACKING_LIST | COO |
OTHER, confidence }`, stored on the `documents` row (`doc_type`, `doc_type_confidence`,
`doc_type_rationale`). A document already typed is not asked about again, so a retry costs
nothing. An unreadable document is never typed. There is no title match and no label set in
code; `resolveRoles` in `compare/triage.ts` (pure) only combines the filename's claim with the
model's word: the claim first, the model's SI or BL for a file that claims nothing, a crossed
pair swapped.

Classification reads the same text. `classify/v5.md` and `classify-verify/v2.md` carry
`reads_attachments: true`; for a run that pins them the classify processor parses the
attachments first (`parse-documents.ts`, idempotent, compare finds the rows) and adds an
"attachment contents" section to the model's input, each file's name and text cut at
`CLASSIFY_ATTACHMENT_CHARS`, an unreadable file named with the parser's reason. Both are
seeded inactive by migration 005: `v3` stays the default until a holdout run shows `v5` helps.

### 6. Compare processor (phase 5 form)

Rewritten 2026-09-20, as built. `checkStructure` in `pipeline/compare/structure.ts` is pure
and holds the whole decision; the processor loads, calls and saves.

```
files = attachments.listForEmail(runId, emailId)
docs  = files ? typeDocuments(parseDocuments(files)) : []      # doc-extract once per file, doc-type once per readable file
req   = files ? null : triage model (prompts/triage/v1.md)      # send_draft | compare_documents; answer reused on a retry
outcome = checkStructure(docs, req):
  any doc unreadable                       -> unreadable   { files: [{ filename, warnings, scanned }] }
  any doc scanned (OCR)                    -> unreadable   { scanned: true, files, provisional: null }
  resolveRoles(docs) -> roles, swapped
  a doc FILLING THE SI OR BL PLACE typed INVOICE/PACKING_LIST/COO/OTHER at >= DOC_TYPE_TRUST_FROM
                                           -> wrong_doc_type { files: [{ filename, claimed, detected, confidence, rationale }] }
  triage(roles, req):
    SI and BL present                      -> compare      (placeholder OK: { placeholder: true, si, bl, extras, swapped })
    nothing attached, send_draft           -> awaiting_draft (OK: { awaiting_draft: true, note })
    nothing attached, compare_documents    -> missing_attachment { missing: [SI, BL], note, attachments: [] }
    a role absent                          -> missing_attachment { missing, note, attachments }
review outcomes: pages rendered for every PDF (unreadable only), then escalate(reason, detail)
```

Amended 2026-09-20 by the review pass (see `PROGRESS.md`, "Design decisions (phase 5 review
pass)"): the type check covers only the files filling the SI and BL places, because an extra
attachment is not the pair being wrong, and a reading below `DOC_TYPE_TRUST_FROM` (0.7) leaves
the file name's claim standing. `documentVerdicts` in the same module gives each document its
verdict for the trace, from that one reading.

`escalate.ts` (an orchestration module, it writes): one open `review_cases` row per email run,
`comparisons` upserted as `NEEDS_REVIEW` with the reason, the email moved from `comparing` to
`review` with `outcome = reason` and `finished_at` set. Precedence when several apply:
`unreadable` > `wrong_doc_type` > `missing_attachment`. Each escalation stops processing.

The compare worker is wrapped in `pausingOnOutage`: a proxy or doc-extract outage pauses the
queue and puts the job back without spending an attempt.

### 7. Compose

Local and VPS: add

```yaml
  doc-extract:
    build: ../services/doc-extract          # ./ path adjusted per file
    environment: { MINIO_ENDPOINT: minio:9000, MINIO_ACCESS_KEY: ..., MINIO_SECRET_KEY: ..., MINIO_BUCKET: retina, OCR_LANGS: eng+chi_sim }
    depends_on: { minio: { condition: service_healthy } }
    healthcheck: { test: ["CMD", "wget", "-qO-", "http://localhost:8000/healthz"], interval: 15s, retries: 5 }
    mem_limit: 1g
    restart: unless-stopped
```

`DOC_EXTRACT_URL=http://doc-extract:8000` in both `.env` files. `auto-deploy.sh`: build
`doc-extract` when `services/doc-extract` changed (hash file, same pattern as averis) and
include it in `up -d`. `/health` gains a `docExtract` check.

### 8. Run page

`GET /runs/:id` gains `review: { open, byReason: { unreadable, wrong_doc_type, ... } }`. Run
page shows a "Needs review" tile with the breakdown; email list gains an `outcome` filter.

### 9. Tests

Python (`pytest`):

- `test_txt.py`: encoding fallback; line endings.
- `test_pdf.py`: real generated pdf pair → label and value on the same line for all seven
  labels; `TOTAL ... KG` line present; garbled fixture → `unreadable`; image fixture →
  `scanned == True`, `unreadable == False`, text contains `Shipper`.
- `test_docx.py`: table rows flattened, CJK glosses preserved, weight value present.
- `test_xlsx.py`: numeric weight rendered as `131058`; A1 shipper line present.
- `test_app.py`: empty file → `unreadable`; unknown extension → `format: unknown`, `unreadable`.

TypeScript:

- `pipeline/compare-triage.test.ts`: every row of the decision table (the model's answer passed in
  as data), extras, UNKNOWN roles, and `resolveRoles` (claim first, model's word, crossed pair).
- `pipeline/compare-structure.test.ts`: each escalation with its detail, the precedence, a scan,
  an untyped document, a crossed pair, the two no-attachment readings.
- `pipeline/classify-attachments.test.ts`: the "attachment contents" section, cut, unreadable, OCR.
- `queues/compare.processor.test.ts`, with `MemoryDocExtractClient` and a `FakeLlmClient` that
  types by content: comparable pair → placeholder OK with both typed and the text in the store;
  invoice as BL → wrong_doc_type with evidence; unopenable BL → unreadable, not typed, pages
  rendered; scanned pair → unreadable with `scanned: true` and page keys; SI only →
  missing_attachment; nothing attached → awaiting_draft or missing_attachment by the triage
  answer; a second pass pays for nothing; a doc-extract outage leaves no row; a second escalation
  leaves one open case; calls stream.
- `queues/processors.test.ts`: a run pinned to classify v5 sees the attachments' text and leaves
  the parsed rows for compare; the active v3 parses nothing.
- `doc-extract/http.client.test.ts`: the wire field names, and each failure mapped to its error.
- `repositories/review-cases.repo.test.ts`: one open case per email run, counts per reason, the
  reason check constraint.

### 10. Manual verification

```bash
docker compose -f backend/compose.local.yaml up -d --build doc-extract
curl -s localhost:8000/healthz            # if port published locally; otherwise via the worker
# full run, then:
psql -c "select format, scanned, unreadable, count(*) from core.documents group by 1,2,3"
psql -c "select reason, count(*) from core.review_cases where status='open' group by 1"
psql -c "select er.email_id from core.review_cases rc join core.email_runs er on er.id=rc.email_run_id order by 1"
```

Expected on this seed: 250 documents; unreadable or scanned exactly on emails 511 to 515;
`wrong_doc_type` on 501 to 505; `missing_attachment` on 506 to 510; no other open cases.

## Exit checklist

- [ ] All 250 attachments produce a `documents` row; the 8 problem files (emails 511 to 515) are the only `unreadable` or `scanned` ones.
- [ ] Exactly the 15 reference `wrong_doc_type`, `missing_attachment`, `unreadable` emails are escalated with the right reason; no other email has an open case.
- [ ] The 94 awaiting-draft emails end `OK` with `detail.awaiting_draft = true`.
- [ ] Python tests pass; a 0-byte file and a garbled PDF return HTTP 200 with `unreadable: true`.
- [ ] doc-extract runs on the box; `/health` shows it up; `auto-deploy.sh` rebuilt it once.
- [ ] Escalation recall on the reliability axis for these three reasons is 15/15 in `pnpm eval:score`.

## Hand-off notes for phase 6

- Documents' text is in MinIO under `text/`; phase 6 reads it from there, not by re-parsing.
- The `scanned` escalation carries `provisional: null`; phase 6 fills it with an OCR-based
  comparison so the reviewer sees a suggested result.
