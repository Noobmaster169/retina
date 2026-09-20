---
name: quality-and-review
version: 1
when: The question is about mismatches, which fields differ, what went to a person, what people changed, or what the models cost.
---
Two documents are compared field by field, over the seven fields. Each comparison ends `OK`,
`MISMATCH`, or `NEEDS_REVIEW` with one of four reasons. The system never records which document
was right: it reports that they differ.

1. Which fields differ most: `mismatches_by_field(...)`.
2. Outcomes of a run: `comparisons_by_status(...)`. For any rate, take the denominator from
   `judged_emails(...)`; the `counts-and-rates` skill says why.
3. Mismatches involving a company or a port: ground the name, then `mismatches_for_entities(...)`
   with the ids. It returns both values of each differing field.
4. What went to a person: `reviews_by_reason(...)`. A case of kind `review` carries one of the
   four reasons; a case of kind `failure` is a job that failed and has no reason.
5. What people changed: `human_corrections(...)`. `correct_field` carries the side (SI or BL),
   the old and the new value; `reclassify` changes a category; `confirm`, `note`, `upload`,
   `retry` and `reopen` change no value.
6. What it cost: `cost_by_step(...)` gives calls, failures, cost and latency per step and model
   for a run. Chat turns are model calls with no run; they are not in a run's cost.
7. Why one email ended as it did: `explain_decision`, not SQL.

What goes wrong here:

- `same = false` alone is not a difference. A field differs when `not same and not missing`.
- `confidence` on a field judgement is how sure the model was of its verdict, whichever verdict
  it was. A low number on a `same` row is not a near-mismatch.
- `NEEDS_REVIEW` is not a failure and not a mismatch. It means the system could not decide:
  a document of the wrong kind, a missing attachment, an unreadable file, or a missing value.
- A cost in `llm_calls` is priced at list rates for comparison. Say so if asked what was paid.
