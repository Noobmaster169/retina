# Phase 6: Extraction and comparison

## Goal

The full document check: seven fields per document with evidence, a deterministic cross-check,
verification on doubt, deterministic comparison, and the complete submission. This phase moves
the 50% end-to-end component of the score.

## Prerequisites

Phase 5 merged: documents parsed to text in MinIO, structural escalations working, LLM layer
from phase 4 available. `PROGRESS.md` states whether the proxy forwards images.

## Scope

In: label harvest, LLM extraction with evidence, evidence check, extraction verifier,
normalisers, comparison, party judge, decision, `missing_value` and `low_confidence`
escalations, provisional results for scans, tables, run page counts. Out: review actions,
dashboard trace page.

## Facts about the data that drive this phase

From `shipment.py` and `render.py`:

- A defect is injected into the BL only. Values are plausible: another real port, another real
  customer name, container count ±1 or ±2 (never back to the original), weight ±500, ±1000
  or ±2000 kg.
- **When a port is mutated in the BL, the UN/LOCODE in parentheses is not updated.** A `.txt`
  BL can read `JEBEL ALI, UAE (KEMBA)` against an SI `MOMBASA, KENYA (KEMBA)`. Comparing codes
  would call this a match and miss the defect. Ports are compared by name with the code stripped;
  the code is never used for equality.
- PDF, DOCX and XLSX render ports without codes; TXT renders them with codes. Name comparison
  handles all four.
- When a party is mutated, only the name line changes; the address lines below still belong to
  the original party. Compare the first line only.
- Weight renders as `131,058 KG` (txt, pdf `TOTAL ...` line), `131,058` (docx), `131058`
  (xlsx numeric). The PDF also has a per-container weight table whose rows must not be mistaken
  for the total.
- Containers render as `6 x 40'HC` everywhere.
- `missing_value` SIs use blank tokens `???`, `_______`, `TBA`, `TBC`, `` (empty), `N/A`,
  `____MT` on one or two of the seven fields, and always carry an extra line
  `NET WEIGHT: ??? MTS` that is not one of the seven fields.
- Labels come from `pools.LABELS`; the CJK variants are `Gross Weight毛重(KGS)` (txt and
  others) and the DOCX glosses `(发货人)`, `(收货人)`, `(通知人)`, `(装货港)`, `(卸货港)`,
  `(箱数)`, `(毛重 KGS)`.

## Work items

### 1. Migration `005_extractions.sql`

```sql
create table core.extractions (
  id              bigserial primary key,
  document_id     bigint not null references core.documents(id) on delete cascade,
  email_run_id    bigint not null references core.email_runs(id) on delete cascade,
  method          text not null check (method in ('llm','llm+verifier','harvest_only')),
  prompt_version  text,
  created_at      timestamptz not null default now(),
  unique (document_id)
);

create table core.extraction_fields (
  id               bigserial primary key,
  extraction_id    bigint not null references core.extractions(id) on delete cascade,
  field            text not null check (field in ('shipper','consignee','notify_party','port_of_loading','port_of_discharge','container_count','gross_weight_kg')),
  value            text,
  placeholder      text,
  source_quote     text,
  confidence       numeric not null default 0,
  evidence_ok      boolean,
  harvest_value    text,
  harvest_agrees   boolean,
  verified         boolean not null default false,
  normalised       text,
  human_value      text,
  note             text,
  unique (extraction_id, field)
);

create table core.field_diffs (
  id               bigserial primary key,
  comparison_id    bigint not null references core.comparisons(id) on delete cascade,
  field            text not null,
  si_value         text,
  bl_value         text,
  si_normalised    text,
  bl_normalised    text,
  judge_used       boolean not null default false,
  judge_confidence numeric,
  unique (comparison_id, field)
);
```

Seed `prompt_versions`: `extract v1`, `extract-verify v1`, `party-judge v1`, all active.

### 2. Label harvest: `src/pipeline/compare/harvest.ts` (pure)

Deterministic candidate values from `Label: value` lines. Used as a cross-check for the LLM
and as the fallback source when the LLM fails.

Synonym table (matching is case-insensitive, on the label with CJK, parentheses and
punctuation stripped, and must be checked in this order so `Notify Party/Intermediate
Consignee` resolves to notify):

| Field | Label patterns (after stripping) |
|---|---|
| notify_party | `NOTIFY PARTY`, `NOTIFY`, `NOTIFY PARTY INTERMEDIATE CONSIGNEE` |
| consignee | `CONSIGNEE`, `CONSIGNEE NON NEGOTIABLE`, `TO THE ORDER OF` |
| shipper | `SHIPPER`, `SHIPPER EXPORTER`, `SHIPPER PRINCIPAL OR SELLER`, `EXPORTER` |
| port_of_loading | `PORT OF LOADING`, `PORT OF LOADING POL`, `LOAD PORT`, `POL` |
| port_of_discharge | `PORT OF DISCHARGE`, `PORT OF DISCHARGE POD`, `DISCHARGE PORT`, `POD` |
| container_count | `NO OF CONTAINERS`, `NO OF CONTAINERS OR PACKAGES`, `TOTAL CONTAINERS`, `CONTAINER COUNT`, `CONTAINERS` |
| gross_weight_kg | `GROSS WEIGHT KG`, `GROSS WEIGHT KGS`, `GROSS WT KGS`, `GROSS WEIGHT`, `TOTAL GROSS WEIGHT`, `TOTAL GROSS WEIGHT KG`, `TOTAL GROSS WEIGHT KGS` |

Line parsing: `^(?<label>[^:]{2,60}):\s*(?<value>.*)$`. The `TOTAL` prefix on the weight
label is part of the pattern above. Lines whose label starts with `NET WEIGHT` are ignored.
For each field the first matching line wins (the PDF per-container table has no `Label:`
form, so it never matches). Output:
`Record<Field, { value: string | null; line: string } | undefined>`.

Value normalisation is not done here; harvest returns raw strings.

### 3. Extraction prompt: `prompts/extract/v1.md`

System prompt content:

- Role: read one shipping document (SI or BL, stated) and return the seven fields.
- The synonym table above, with the note that labels may carry Chinese glosses in
  parentheses and that `To the Order of` is the consignee on a BL.
- Return values **verbatim** as they appear (no reformatting, no unit conversion, no
  arithmetic). For parties, return the name line only, not the address.
- `source_quote` must be an exact substring of one line of the document. If the label exists
  but the value is blank or a placeholder (`???`, underscores, `TBA`, `TBC`, `N/A`, empty),
  set `value: null` and put the placeholder text in `placeholder`. If the label does not
  exist at all, set `value: null`, `placeholder: null`, and a short `note`.
- For weight use the total line, never a per-container row. Ignore `NET WEIGHT`.
- Output only JSON matching `{{schema}}`.
- `{{examples}}`: two worked examples (one txt SI, one docx-style BL) drawn from the train
  split by `pnpm eval:examples`, with the expected JSON.

User message: `role`, `format`, `text` (full extracted text; cap 12 000 characters, which no
generated document approaches), and when the document is scanned and the proxy forwards
images, the page PNGs as image parts after the OCR text.

Output schema `ExtractOutput`:

```ts
const FieldOut = z.object({
  value: z.string().nullable(),
  placeholder: z.string().nullable().default(null),
  source_quote: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  note: z.string().max(200).optional(),
});
z.object({ shipper: FieldOut, consignee: FieldOut, notify_party: FieldOut, port_of_loading: FieldOut,
           port_of_discharge: FieldOut, container_count: FieldOut, gross_weight_kg: FieldOut })
```

### 4. Evidence check: `src/pipeline/compare/evidence.ts` (pure)

```ts
checkEvidence(text, field: FieldOut): { ok: boolean; reason?: "no_quote" | "quote_not_found" | "value_not_in_quote" }
```

Normalise both sides: collapse whitespace, uppercase. `ok` when `source_quote` is a substring
of the text and `value` (if not null) is a substring of `source_quote`. Null value with a
placeholder: `ok` when the quote is found.

### 5. Cross-check and verifier trigger: `src/pipeline/compare/reconcile.ts` (pure)

Per field:

```
harvestNorm = normalise(field, harvest.value)      // section 6 normalisers
llmNorm     = normalise(field, llm.value)
agrees      = harvestNorm !== undefined && harvestNorm === llmNorm
needsVerify = !evidence.ok || llm.confidence < 0.7 || (harvest present && !agrees)
```

Document needs the verifier if any field `needsVerify`. Verifier prompt
`prompts/extract-verify/v1.md`: receives the text, the LLM's JSON, the harvest candidates, and
the list of fields in doubt with the reason; instructed to re-read those fields only and
return the same `ExtractOutput` shape for all seven (unchanged fields copied). After the
verifier: fields still failing evidence, or still disagreeing with a present harvest value,
are resolved as follows: if harvest has a value → use harvest with `note = "harvest_fallback"`;
else → field `value: null`, `note = "unresolved"` (this becomes a `low_confidence` escalation).

Method recorded on `extractions.method`: `llm`, `llm+verifier`, or `harvest_only` (LLM call
failed with `TerminalError` twice and harvest covered all seven fields; otherwise the job fails
and retries).

### 6. Normalisers: `src/pipeline/compare/normalise.ts` (pure, one function per field)

```ts
export function normalise(field: Field, raw: string | null): string | undefined   // undefined = cannot normalise (missing)
export function isPlaceholder(raw: string | null): boolean
```

`isPlaceholder`: null, empty, or matches `/^\s*(\?{2,}|_{3,}\s*(MT|MTS)?|-{3,}|TBA|TBC|TBD|N\/?A|NIL|PENDING)\s*$/i`.
Placeholders normalise to `undefined`.

| Field | Steps | Example |
|---|---|---|
| gross_weight_kg | take the first number token (`[\d.,]+`); strip `,`; parse; if a unit token `MT`/`MTS`/`TON(NE)?S?` follows and value < 10 000, multiply by 1000; round to integer; stringify | `131,058 KG` → `131058`; `235.5 MT` → `235500`; `131058` → `131058` |
| container_count | first integer token; if none, sum of `(\d+)\s*[xX×]` groups; stringify | `6 x 40'HC` → `6`; `12 x 20'FCL` → `12` |
| port_of_loading, port_of_discharge | uppercase; strip a trailing `(XXXXX)` code and any `(...)` group; replace `/` and `-` with space; remove punctuation except comma; collapse spaces; trim | `NANTONG, CHINA (CNNTG)` → `NANTONG, CHINA`; `Jebel Ali, UAE` → `JEBEL ALI, UAE` |
| shipper, consignee, notify_party | first line only; uppercase; replace `&` with `AND`; remove punctuation (`.,;:'"()`) ; collapse spaces; trim | `MOORIM SP CO., LTD` → `MOORIM SP CO LTD`; `EAST BRIGHT FZ-LLC` → `EAST BRIGHT FZ-LLC` |

Legal-suffix stripping is **not** applied for equality (two pool shippers differ only by a
suffix-like tail). It is only applied as a hint for the party judge.

### 7. Comparison: `src/pipeline/compare/compare.ts` (pure)

```ts
export interface SideValue { raw: string | null; placeholder: string | null; normalised: string | undefined; unresolved: boolean }
export interface CompareResult {
  diffs: { field; si: SideValue; bl: SideValue }[]
  missing: { field; side: "SI" | "BL" | "both"; placeholder: string | null }[]   // isPlaceholder or null with label present
  unresolved: { field; side }[]                                                   // label absent / verifier could not locate
  judgeCandidates: { field; si: string; bl: string }[]                            // party fields whose normalised names differ
}
compare(si: Record<Field, SideValue>, bl: Record<Field, SideValue>): CompareResult
```

Per field:

1. Either side `unresolved` → `unresolved`.
2. Either side placeholder or null → `missing`.
3. Numeric and port fields: `si.normalised !== bl.normalised` → `diffs`.
4. Party fields: `si.normalised !== bl.normalised` → `judgeCandidates` (the processor turns
   these into diffs or matches after the judge).

Human values (`extraction_fields.human_value`) replace `raw` before normalisation when present.

### 8. Party judge: `prompts/party-judge/v1.md`

Input: field, `si_name`, `bl_name`, both with their address lines for context. Instructions:
same legal entity only if the difference is punctuation, spacing, a legal-form suffix variant
(`CO., LTD` vs `CO LTD`, `PTE. LTD.` vs `PTE LTD`), or an obvious typo; a different company
name, a different branch entity (`(MIDDLE EAST) FZE` vs none), or a different parent is a
different entity. Output:

```ts
z.object({ same_entity: z.boolean(), confidence: z.number(), rationale: z.string().max(300) })
```

Resolution: `same_entity && confidence >= 0.8` → match; `!same_entity && confidence >= 0.8` →
diff with `judge_used = true`; otherwise → `low_confidence` escalation for that field.

### 9. Decision: `src/pipeline/compare/decide.ts` (pure)

```
input: CompareResult after judge, plus flags { scanned }
if unresolved non-empty or judge-unsure non-empty -> NEEDS_REVIEW low_confidence  (detail lists fields)
else if missing non-empty                           -> NEEDS_REVIEW missing_value    (detail lists fields and placeholders, plus any diffs found on other fields as provisional)
else if diffs empty                                 -> OK
else                                                -> MISMATCH, defect_fields = diffs.map(field)
```

Precedence across the whole pipeline (phase 5 plus this phase):
`unreadable` > `wrong_doc_type` > `missing_attachment` > `missing_value` > `low_confidence`.

Scanned documents: the processor runs extraction and comparison on the OCR text (and images if
forwarded), then escalates `unreadable` with `detail.provisional = { status, defect_fields,
diffs }` so the reviewer sees a suggested result. Submission stays `NEEDS_REVIEW / unreadable`.

### 10. Compare processor (final form; replaces the phase 5 placeholder tail)

```
... phase 5 triage, parse, fingerprint, structural escalations (scan handled below) ...
for doc in (si, bl):
  text     = objectStore.get(keys.text(...))
  harvest  = harvestLabels(text)
  llm      = callStructured(extract, { role, format, text, images? })
  evidence = per field checkEvidence(text, llm[field])
  rec      = reconcile(llm, harvest, evidence)
  if rec.needsVerify: llm2 = callStructured(extract-verify, {...}); rec = reconcile(llm2, harvest, evidence(llm2))
  extractions.upsert(document_id, method, prompt_version); extraction_fields.upsert(all seven with harvest_value, harvest_agrees, evidence_ok, verified, normalised)
sides    = toSideValues(si fields, bl fields)      // applies human_value when present
result   = compare(sides.si, sides.bl)
for c in result.judgeCandidates: judge = callStructured(party-judge, c); apply resolution
decision = decide(result, { scanned })
if scanned: escalate(unreadable, { scanned: true, pages, provisional: decision }); return
if decision.status == NEEDS_REVIEW: escalate(decision.reason, decision.detail); return
comparisons.upsert({ status, has_defect, detail: { diffs, judge } }); field_diffs.replaceAll(comparison_id, diffs)
emailRuns.setStage(done, outcome = status)
```

Reruns: `rerunFrom: "compare"` skips extraction and reuses `extraction_fields` (with human
values); `rerunFrom: "extract"` re-extracts; `rerunFrom: "triage"` starts over. All three
replace rows through upserts.

### 11. Submission builder update

`defect_fields` from `field_diffs` ordered by field name. `review_reason` passes through only
the scorer's four reasons; `low_confidence` becomes `null`.

### 12. Run page

Tiles: mismatches, OK, needs review by reason; a small bar of defect field frequency
(`field_diffs` grouped). Email list `status` filter and a `defect_fields` column.

### 13. Tests

- `harvest.test.ts`: every synonym including CJK forms; `NET WEIGHT` ignored; `TOTAL Gross
  Weight毛重(KGS): 67,311 KG`; notify-before-consignee ordering; docx `label (gloss): value`
  lines; xlsx `Gross Weight (KG): 131058`.
- `normalise.test.ts`: the examples in section 6 plus `_______ MTS`, `____MT`, `???`, empty,
  `N/A` as placeholders; `235,550 KG`; `3 x 20'GP`; `CONAKRY, GUINEA (GNCKY)` vs
  `CONAKRY, GUINEA` equal; `JEBEL ALI, UAE (KEMBA)` vs `MOMBASA, KENYA (KEMBA)` not equal.
- `evidence.test.ts`: found, not found, value not in quote, placeholder with found quote.
- `reconcile.test.ts`: agreement suppresses verifier; disagreement triggers; harvest fallback.
- `compare.test.ts` and `decide.test.ts`: table-driven over the brief's cases (516, 517, 518
  false alarms become no-diff or missing_value), one- and two-field defects, party candidates,
  precedence of reasons, provisional for scans.
- `compare.processor.test.ts`: full path with `FakeLlmClient` returning canned extraction JSON
  for `email_004` (expect `MISMATCH` with `["consignee","notify_party"]`), a missing_value SI,
  and a scanned pair (expect `unreadable` with `provisional`).
- Golden test: `test/golden/compare.golden.test.ts` runs the pure pipeline (harvest as the
  extractor stand-in, no LLM) over every train-split `.txt` pair and asserts the outcome
  against ground truth. This catches normaliser regressions without network. It reads ground
  truth through `eval/ground-truth.ts` and is skipped when `EVAL_GROUND_TRUTH_PATH` is unset.

### 14. Manual verification

```bash
pnpm eval:examples                        # adds extract examples
# full run, then
pnpm eval:score --run <id> --holdout
psql -c "select status, review_reason, count(*) from core.comparisons c join core.email_runs er on er.id=c.email_run_id where er.run_id='<id>' group by 1,2"
psql -c "select method, count(*) from core.extractions e join core.email_runs er on er.id=e.email_run_id where er.run_id='<id>' group by 1"
psql -c "select field, count(*) from core.field_diffs fd join core.comparisons c on c.id=fd.comparison_id join core.email_runs er on er.id=c.email_run_id where er.run_id='<id>' group by 1 order by 2 desc"
```

Expected on this seed: 46 `MISMATCH`, 5 `missing_value`, no `low_confidence` on `.txt`
pairs, defect field histogram close to container_count 19, port_of_discharge 13,
gross_weight_kg 12, notify_party 8, consignee 7, shipper 7, port_of_loading 6.

## Exit checklist

- [ ] End-to-end on holdout at or above 0.80; full-set final score at or above 0.85; numbers in `PROGRESS.md`.
- [ ] Zero self-inflicted `missing_value` or `low_confidence` escalations on `.txt`, `.docx`, `.xlsx`, `.pdf` pairs of the main 500.
- [ ] The 5 reference `missing_value` emails escalate as `missing_value`, none as `MISMATCH`.
- [ ] Port mutations with stale codes are caught (spot-check two `port_of_discharge` defects in txt pairs).
- [ ] Extraction verifier ran on under 20% of documents; party judge on under 5% of comparisons.
- [ ] Scanned pairs (512 to 514) escalate `unreadable` with a `provisional` result attached.
- [ ] Golden test passes on the train split.

## Hand-off notes for phase 7

- Every value the trace page needs is now in `extraction_fields` (with `source_quote`) and
  `field_diffs`. Phase 7 is read-only over these tables.
