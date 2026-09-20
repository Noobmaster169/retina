---
name: counts-and-rates
version: 1
when: The answer is a count, a share, a rate, a ranking or a total.
---
Most wrong numbers here come from the wrong row being counted, or the wrong denominator. Name
both before you compute anything.

What one row is:

| Relation | One row is |
|---|---|
| `core.emails` | one email, stored once however many runs replay it |
| `core.email_runs`, `analytics.fact_email_outcome` | one email in one run |
| `core.comparisons` | one email in one run that reached the comparison step |
| `core.field_diffs`, `analytics.fact_field_diff` | one of the seven fields of one comparison: seven rows per judged pair, whether or not they differ |
| `core.entity_mentions` | one extracted field of one document in one run |
| `core.llm_calls` | one attempt at one model call |

Choosing the denominator:

- `emails_by_category(...)` gives the emails of a run by category.
- A comparison rate is never "mismatches over comparison emails". Many emails sorted as
  comparisons only ask for a draft to be sent and carry nothing to compare; they end `OK` with
  no judged field. `judged_emails(...)` returns the four figures side by side: sorted as a
  comparison, with a comparison row, with fields a model actually judged, and mismatches. A
  mismatch rate is mismatches over emails with judged fields. Say which one you used.
- A field differs when `not same and not missing`. `missing` means a value was absent or a
  placeholder, which sends the email to a person; it is not a difference.
- `comparisons_by_status(...)`, `mismatches_by_field(...)` and `senders_ranked(...)` cover the
  common rankings.

What goes wrong here:

- `core.emails.tonnage_mt` is a token read from some subject lines. It is not the documented
  weight and is absent on most emails. Weight is the `gross_weight_kg` field, stored as the
  document wrote it (with separators and a unit), so it cannot be summed in SQL. Report the
  values as written, or say the total is out of reach. The same holds for `container_count`.
- The `analytics` views are refreshed every five minutes. For a run still in progress, or a
  figure that must match a screen exactly, read `core`. The recipes do.
- An email's category can be a person's correction. `coalesce(human_category, final_category)`
  is the category that counts, and the recipes use it.
- Count emails with `count(distinct email_id)`. Counting mentions or field rows and calling them
  emails is the most common mistake in this schema.
- When a result was cut at the row cap, a count taken from its length is wrong. Count in SQL.
