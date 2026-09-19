# Phase 6: Extraction and comparison

## Amended 2026-09-19: the model judges whether two values match

This governs wherever the work items below disagree with it.

- **No normalisers, no label harvest, no suffix or unit tables.** Those were hand-written rules
  read off this dataset (one of them by name: ports compared by name because this generator
  leaves the old code behind). Extraction stays an LLM call with `source_quote` evidence. The
  comparison is an LLM call too: the field judge (`prompts/field-judge/v1.md`, `sonnet`) answers
  `{ same, missing, confidence, rationale }` for each of the seven fields; see `03-infra-deep.md` 5.3.
- **Code assembles, it does not decide.** `compare/assemble.ts` (pure) turns the seven judgements
  into `defect_fields` and the `missing_value` escalation and validates every field name against
  the `ComparisonField` enum. The evidence check (the quote must exist in the document text) stays:
  it verifies the model, it does not replace it.
- `review_reason` is exactly the organisers' four. The judge always decides.
- Every change is measured on the train split, and the holdout is read last. Exact set equality
  means one wrongly flagged field costs the email, so measure before trusting the judge.
- The work items below were rewritten under this section on 2026-09-20, when the phase started.
  The original items (label harvest, normalisers, a party judge on under 5% of comparisons, a
  golden test with the harvest as the extractor) are in git history before that date.

## Goal

The full document check: seven fields per document with evidence, verification on doubt, a
judged comparison, and the complete submission. This phase moves the 50% end-to-end component
of the score.

## Prerequisites

Phase 5 merged: documents parsed to text in MinIO, structural escalations working, LLM layer
from phase 4 available. Read `phase-06-handover.md` first: it says where the branch plugs in and
what moved under this spec.

## Scope

In: LLM extraction with evidence, the evidence check, the extraction verifier, the field judge,
assembly and decision, `missing_value` escalations, provisional results for scans, the three
tables, the submission's `defect_fields`, the trace and the run page. Out: review actions, the
dashboard trace page, few-shot examples for any of the three new steps (they ship only when a
holdout run shows they help).

## Facts about the data that drive this phase

From `shipment.py` and `render.py`. These say what the pipeline must cope with; none of them
becomes a rule in code or a sentence in a prompt.

- A defect is injected into the BL only. Values are plausible: another real port, another real
  customer name, container count ±1 or ±2 (never back to the original), weight ±500, ±1000
  or ±2000 kg.
- When a port is mutated in the BL, the UN/LOCODE in parentheses is not updated. A `.txt` BL can
  read `JEBEL ALI, UAE (KEMBA)` against an SI `MOMBASA, KENYA (KEMBA)`. A judge that read the
  code would call this a match. The prompt states the domain principle (a port is the place
  named; a code beside it does not make two different places one), never this generator's habit.
- PDF, DOCX and XLSX render ports without codes; TXT renders them with codes.
- When a party is mutated, only the name line changes; the address lines below still belong to
  the original party. The extractor returns the name line only.
- Weight renders as `131,058 KG` (txt, pdf `TOTAL ...` line), `131,058` (docx), `131058` (xlsx
  numeric). The PDF also has a per-container weight table whose rows must not be mistaken for the
  total.
- Containers render as `6 x 40'HC` everywhere.
- `missing_value` SIs use blank tokens `???`, `_______`, `TBA`, `TBC`, `` (empty), `N/A`,
  `____MT` on one or two of the seven fields, and always carry an extra line
  `NET WEIGHT: ??? MTS` that is not one of the seven fields.
- Labels come from `pools.LABELS`; the CJK variants are `Gross Weight毛重(KGS)` (txt and
  others) and the DOCX glosses `(发货人)`, `(收货人)`, `(通知人)`, `(装货港)`, `(卸货港)`,
  `(箱数)`, `(毛重 KGS)`.
- The proxy's `claudecli` capability table says `images: deny`: page images never reach the
  model. A scanned pair is compared on its OCR text and the reviewer sees the PNGs.

## Work items

### 1. Migration `006_extractions.sql`

```sql
create table core.extractions (
  id              bigserial primary key,
  document_id     bigint not null unique references core.documents(id) on delete cascade,
  email_run_id    bigint not null references core.email_runs(id) on delete cascade,
  prompt_version  text not null,
  model           text not null,
  -- Whether the verifier ran on this document. Its answer replaced the fields it was asked about.
  verified        boolean not null default false,
  created_at      timestamptz not null default now()
);

create table core.extraction_fields (
  id               bigserial primary key,
  extraction_id    bigint not null references core.extractions(id) on delete cascade,
  field            text not null check (field in (the seven)),
  value            text,
  placeholder      text,
  source_quote     text,
  confidence       numeric not null default 0,
  evidence_ok      boolean not null default false,
  human_value      text,
  note             text,
  unique (extraction_id, field)
);

create table core.field_diffs (
  id               bigserial primary key,
  comparison_id    bigint not null references core.comparisons(id) on delete cascade,
  field            text not null check (field in (the seven)),
  si_value         text,
  bl_value         text,
  same             boolean not null,
  missing          boolean not null,
  confidence       numeric,
  rationale        text,
  unique (comparison_id, field)
);
```

`field_diffs` holds every field's judgement, not only the differing ones: the trace shows all
seven, and `defect_fields` is the rows where `same` and `missing` are both false. Seed
`prompt_versions`: `extract v1`, `extract-verify v1`, `field-judge v1`, all active.

### 2. Extraction prompt: `prompts/extract/v1.md`

System prompt content, every statement from the brief's domain primer or the organisers' README:

- Role: read one shipping document (an SI or a BL, which one is stated) and return the seven
  fields the two are compared on.
- What each field is, in the terms of the domain: the shipper, the consignee (on a BL the
  negotiable wording `To the Order of` names it), the notify party, the port of loading, the
  port of discharge, the container count, the gross weight. Labels differ between the two
  documents and may carry a second language in brackets; the field is the thing named, not the
  label's wording.
- Return values verbatim as they appear: no reformatting, no unit conversion, no arithmetic.
  For a party, the name line only, not the address lines under it. For the weight, the
  document's total, never one row of a per-container table.
- `source_quote` is an exact substring of one line of the document. A label present with a
  blank or a placeholder beside it is `value: null` with the placeholder text in `placeholder`.
  A field the document does not carry at all is `value: null`, `placeholder: null`, with a
  short `note`.
- Output only JSON matching `{{schema}}`.

User message: `role`, `format`, `text` (the full extracted text, cut at `EXTRACT_TEXT_CHARS`,
12 000, which no generated document approaches).

Output schema `ExtractOutput`, in `agents/extract.ts`:

```ts
const FieldOut = z.object({
  value: z.string().nullable(),
  placeholder: z.string().nullable(),
  source_quote: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  note: z.string().max(200).nullable(),
});
z.object({ shipper: FieldOut, consignee: FieldOut, notify_party: FieldOut, port_of_loading: FieldOut,
           port_of_discharge: FieldOut, container_count: FieldOut, gross_weight_kg: FieldOut })
```

### 3. Evidence check: `src/pipeline/compare/evidence.ts` (pure)

```ts
checkEvidence(text, field: FieldOut): { ok: boolean; reason?: "no_quote" | "quote_not_found" | "value_not_in_quote" }
fieldsInDoubt(text, output: ExtractOutput): { field; reason }[]
```

Both sides whitespace-collapsed and uppercased. `ok` when `source_quote` is a substring of the
text and `value`, when not null, is a substring of `source_quote`. A null value with a
placeholder is `ok` when the quote is found. A null value with no placeholder and no quote (the
label is absent) is `ok`: there is nothing to prove. `fieldsInDoubt` lists every field whose
evidence fails or whose confidence is under `EXTRACT_TRUST_FROM` (0.7).

### 4. Verifier: `prompts/extract-verify/v1.md`

Runs on a document with any field in doubt. Receives the role, the text, the first answer and
the fields in doubt with the reason for each; re-reads those fields and returns the same
`ExtractOutput` shape for all seven, the others copied. After it, a field still failing evidence
is `value: null, placeholder: null, note: "could not be located"`: a value that cannot be found
in the document is uncertainty, and the organisers' enum has one reason for uncertainty,
`missing_value`. A verifier that fails for good (its output never fits the schema) degrades the
same way: the fields in doubt become unlocated and the email goes to a person. An outage pauses
the queue as everywhere.

`extractions.verified` records whether it ran.

### 5. Field judge: `prompts/field-judge/v1.md`

One call per pair. The model receives, for each of the seven fields, the SI value and the BL
value as extracted with their source quotes, and answers for each:

```ts
z.object({ rationale: z.string().max(300), same: z.boolean(), missing: z.boolean(), confidence: z.number().min(0).max(1) })
```

`same` means the two values denote the same thing in a shipping document: a weight with and
without its thousands separator or unit, a port with and without a code beside it, a company
name with and without punctuation or a legal-form spelling variant. A different company, a
different branch entity, a different place, a different count or weight is not the same.
`missing` means either value is blank, a placeholder or a note that nothing was found, which is
uncertainty and never a difference. The prompt states those principles in the organisers' terms;
it lists no normalisation rules and no values from the dataset.

A field with `value: null` on either side is not sent to the judge: the extractor already said
there is nothing there, and code records it as missing. The judge sees the fields with two
values and can still call one of them missing.

### 6. Assembly: `src/pipeline/compare/assemble.ts` (pure)

```ts
assemble(si: ExtractedFields, bl: ExtractedFields, judged: Partial<Record<Field, Judgement>>): Assembled
// Assembled = { fields: FieldJudgement[]; defectFields: ComparisonField[]; missing: ComparisonField[] }
```

One `FieldJudgement` per field, in the enum's order: the two values (`human_value` where a
person set one), `same`, `missing`, confidence and rationale. A side with `value: null` makes the
field `missing` with a rationale naming the placeholder or note. `defectFields` is the fields
judged `same: false` and not missing; `missing` is the fields judged missing on either side.
Every name is validated against `ComparisonField`; a judgement for a name outside it is a
`TerminalError`, never a submitted value.

### 7. Decision: `src/pipeline/compare/decide.ts` (pure)

```
if missing non-empty          -> NEEDS_REVIEW missing_value, detail: { missing, defect_fields as provisional }
else if defectFields empty    -> OK
else                          -> MISMATCH, defect_fields
```

Precedence across the whole pipeline: `unreadable` > `wrong_doc_type` > `missing_attachment` >
`missing_value`. The first three are decided by `checkStructure` before this branch runs.

Scanned pairs: the processor runs extraction and the judge on the OCR text and escalates
`unreadable` with `detail.provisional = { status, review_reason, defect_fields, missing }` so the
reviewer sees a suggested result. The submission stays `NEEDS_REVIEW / unreadable`.

### 8. Compare processor (final form; replaces the phase 5 placeholder tail)

```
... phase 5: parse, type, checkStructure; unreadable / wrong_doc_type / missing_attachment escalate as before ...
for doc in (si, bl):                                   // queues/processors/extract-fields.ts
  row = extractions.forDocument(doc.id)                // an answer already paid for, under the run's prompt version
  if row: fields = row.fields; continue
  out      = extractFields(prompt, { role, format, text })
  doubt    = fieldsInDoubt(text, out)
  if doubt: out = verifyExtraction(prompt, { role, text, first: out, doubt }) or degrade; unlocated fields -> null
  extractions.replace(doc.id, { promptVersion, model, verified }, fields with evidence_ok)
judged   = judgeFields(prompt, { si fields, bl fields })   // queues/processors/compare-pair.ts
result   = assemble(si, bl, judged)
decision = decide(result)
if scanned: escalate(unreadable, { scanned, files, pages, provisional: decision }); return
if decision.status == NEEDS_REVIEW: escalate(missing_value, { ...decision.detail, si, bl, extras, swapped }); return
comparisons.upsert({ status, has_defect, detail: { si, bl, extras, swapped, defect_fields } }); fieldDiffs.replaceAll(comparison_id, result.fields)
emailRuns.moveStage(done, outcome = status)
```

`extractions` is keyed by document, so a job that runs twice (a retry after a judge outage, a
stalled job reclaimed) reads its extractions back instead of paying for them. A human value
on `extraction_fields.human_value` replaces the model's on the way into the judge; the review
action that sets it is phase 8.

### 9. Submission builder update

`defect_fields` from `field_diffs` (rows with `same = false and missing = false`) ordered by
field name, read through `emailRuns.listForSubmission`. `review_reason` is one of the
organisers' four or null.

### 10. Contracts, trace and run page

- `PromptStep` and `PromptSet` gain `extract`, `extract-verify`, `field-judge`, with the env
  overrides, the frontend mirrors, the step labels and the run form dropdowns (handover section
  4).
- `Outcome` gains `MISMATCH`: `email_runs.outcome` carries the comparison status, so the email
  list can filter on it.
- `EmailTrace` gains `extractions: ExtractionView[]` (per document: filename, role, verified,
  prompt version, the seven fields with value, placeholder, quote, confidence, evidence) and
  `comparison: ComparisonView | null` (status, reason, defect fields, the seven judgements).
  `EmailListItem` gains `defectFields`. `RunSummary` gains `outcomes: { ok, mismatch, byField }`.
- The run page: a comparison panel under the documents (seven rows: SI value, BL value, the
  judge's verdict and rationale, with the quotes on hover); a defect-fields column in the email
  list; OK and MISMATCH tiles and a defect-field bar on the overview.

### 11. Tests

- `evidence.test.ts`: found, not found, value not in quote, placeholder with found quote, absent
  label, whitespace and case, `fieldsInDoubt` on confidence and on evidence.
- `assemble.test.ts`: table-driven over the brief's cases with real lines from `email_001`,
  `004`, `516`, `517`: one- and two-field defects, a placeholder on one side, an unlocated value,
  a human value replacing the model's, a name outside the enum refused.
- `decide.test.ts`: OK, MISMATCH, `missing_value` with provisional defects, the detail shape.
- `compare.processor.test.ts`: the full path with `FakeLlmClient` answering by content: the
  `email_004` pair (expect `MISMATCH` with `["consignee", "notify_party"]`), a `missing_value`
  SI, a scanned pair (expect `unreadable` with `provisional`), the verifier on a failed quote, a
  second pass reusing the extraction rows, a verifier that fails for good.
- `extractions.repo.test.ts` and `field-diffs.repo.test.ts` in a rolled-back transaction.
- `registry.test.ts`: the three prompts in `shipped`.
- `submission.test.ts`: `defect_fields` from `field_diffs`.

There is no golden test: without a harvest there is no extractor stand-in that runs offline,
and the eval harness on a run is the measurement.

### 12. Manual verification

```bash
# a run of explicit train ids (20 to 30 emails: pairs in every format plus the train edge cases), then
pnpm eval:score --run <id>
psql -c "select status, review_reason, count(*) from core.comparisons c join core.email_runs er on er.id=c.email_run_id where er.run_id='<id>' group by 1,2"
psql -c "select verified, count(*) from core.extractions e join core.email_runs er on er.id=e.email_run_id where er.run_id='<id>' group by 1"
psql -c "select field, count(*) from core.field_diffs fd join core.comparisons c on c.id=fd.comparison_id join core.email_runs er on er.id=c.email_run_id where er.run_id='<id>' and not fd.same and not fd.missing group by 1 order by 2 desc"
```

Expected on the full seed: 46 `MISMATCH`, 5 `missing_value`, defect field histogram close to
container_count 19, port_of_discharge 13, gross_weight_kg 12, notify_party 8, consignee 7,
shipper 7, port_of_loading 6. The full run and the holdout are the user's.

## Exit checklist

- [ ] End-to-end on holdout at or above 0.80; full-set final score at or above 0.85; numbers in `PROGRESS.md`.
- [ ] Zero self-inflicted `missing_value` escalations on `.txt`, `.docx`, `.xlsx`, `.pdf` pairs of the main 500.
- [ ] The 5 reference `missing_value` emails escalate as `missing_value`, none as `MISMATCH`.
- [ ] Port mutations with stale codes are caught (spot-check two `port_of_discharge` defects in txt pairs).
- [ ] Extraction verifier ran on under 20% of documents.
- [ ] Scanned pairs (512 to 514) escalate `unreadable` with a `provisional` result attached.
- [ ] Every judged field is in `field_diffs` and every extracted value in `extraction_fields` with its quote.

## Hand-off notes for phase 7

- Every value the trace page needs is now in `extraction_fields` (with `source_quote`) and
  `field_diffs` (all seven judgements per comparison). Phase 7 is read-only over these tables.
- `GET /runs/:id/emails/:emailId/trace` already carries both as `extractions` and `comparison`.
