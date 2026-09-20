# The database you may query

Read-only. Prefer the `analytics` views: they are already joined and already
carry the precedence rules, so a query over them cannot quietly disagree with
what a screen shows. Drop to `core` only for something the views do not hold.

## What this system does

It replays an inbox of shipping emails. Each email is sorted into a category.
An email sorted `BL_COMPARISON` has two documents attached, a Shipping
Instruction (SI) and a draft Bill of Lading (BL); seven fields are read out of
each and a model judges, field by field, whether the two values denote the same
thing. The result is `OK`, `MISMATCH`, or `NEEDS_REVIEW`.

A **run** is one replay of the inbox. The same email may appear in several
runs with different outcomes, which is the point: a run is how a prompt change
is measured. **Almost every question is about one run.** When the question
does not name one, say which run you used.

## The enums, value for value

These are the organisers' definitions. There are no other values, and a value
not on these lists does not exist.

- `category`: `BL_COMPARISON`, `SI_REQUEST`, `INVOICE_QUERY`, `GENERAL`, `SPAM`
- `status`: `OK`, `MISMATCH`, `NEEDS_REVIEW`
- `review_reason`: `wrong_doc_type`, `missing_attachment`, `unreadable`, `missing_value`.
  Set exactly when the status is `NEEDS_REVIEW`, and null otherwise.
- the seven fields: `shipper`, `consignee`, `notify_party`, `port_of_loading`,
  `port_of_discharge`, `container_count`, `gross_weight_kg`
- `stage`: `ingested`, `classifying`, `classified`, `comparing`, `review`, `done`, `failed`
- `category_decided_by`: `llm`, `verifier`, `human`. Which layer settled the category.
  There is no `rule`: no hand-written rule decides a category in this system, on purpose.

## analytics.fact_email_outcome

One row per email per run. Grain `(run_id, email_id)`. Start here.

- `run_id`, `email_id`, `email_run_id`
- `sender_domain`, `client_tier` (1 first, 5 last; 3 where nobody ranked the sender), `client_name`
- `subject`, `tonnage_mt` (null for an email that names no tonnage)
- `category` — the human correction where one exists, else the model's. Use this one.
- `model_category` — what the model said, ignoring any correction. Use only to compare the two.
- `category_decided_by`, `comparison_decided_by`
- `status`, `review_reason`, `has_defect`
- `n_defects` — how many of the seven fields differed. Counts differences, not judgements.
- `llm_calls`, `llm_cost_usd`
- `stage`, `started_at`, `finished_at`, `latency_ms`
- `human_touched` — whether anyone acted on it

## analytics.fact_field_diff

One row per field judgement: all seven per comparison, not only the ones that
differed. Grain `(run_id, email_id, field)`.

- `run_id`, `email_id`, `sender_domain`, `comparison_id`, `field`
- `si_value`, `bl_value` — what each document said, verbatim
- `same` — the judge's verdict
- `missing` — either side blank or a placeholder. Uncertainty, never a difference.
- `differed` — `not same and not missing`. **This is what "a defect" means.** Filter on it.
- `confidence`, `judged` — whether a model compared this pair at all

## analytics.agg_client_run

One row per sender per run. `(run_id, sender_domain)`.

`client_name`, `client_tier`, `emails`, `comparisons`, `mismatches`, `reviews`,
`human_touched`, `llm_cost_usd`, `top_defect_field`.

`top_defect_field` already answers "and on which field", so a question about a
client's worst field is one row of this view and needs no join.

## analytics.agg_run_stage

One row per run. `emails`, `done`, `review`, `failed`, `verifier_decided`,
`human_decided`, `llm_calls`, `llm_cost_usd`, `first_at`, `last_at`.

## analytics.dim_client

Every sender ever seen, plus every client anyone ranked. `domain`, `name`,
`tier`, `kind`, `known`, `emails`, `mismatches`. `known` is false for a domain
that has emailed but that nobody ranked; its tier and kind are the defaults, so
do not report them as decisions anyone made.

## analytics.dim_run

`id`, `status`, `rate_per_second`, `total_emails`, `prompt_set`, `created_at`,
`started_at`, `finished_at`, `final_score`. The latest run is
`order by created_at desc limit 1`.

## core, when the views do not reach

`core.emails` (`email_id`, `from_addr`, `sender_domain`, `subject`, `body`,
`tonnage_mt`, `first_seen_at`), `core.email_runs`, `core.classifications`,
`core.documents` (`doc_type`, `scanned`, `unreadable`, `pages`),
`core.extractions` and `core.extraction_fields` (`value`, `source_quote`,
`evidence_ok`, `human_value`, `confidence`), `core.comparisons`,
`core.field_diffs`, `core.review_cases`, `core.review_actions`,
`core.llm_calls` (no prompt or response text: you may read `step`, `model`,
`prompt_version`, tokens, `cost_usd`, `latency_ms`, `ok`, `error`),
`core.entities`, `core.entity_names`, `core.entity_mentions`.

`core.entities` holds the ports and parties the extractor read out of
documents. A spelling joins one only because the field judge said it denotes
the same thing; `core.entity_names.joined_by` says which, and there is no
lookup table anywhere in this system.

## Example questions, and the SQL that answers them

**Which client had the most mismatches in the latest run, and on which field?**

```sql
select c.sender_domain, c.client_name, c.mismatches, c.top_defect_field
  from analytics.agg_client_run c
  join analytics.dim_run r on r.id = c.run_id
 where r.id = (select id from analytics.dim_run order by created_at desc limit 1)
 order by c.mismatches desc
 limit 5
```

**Which of the seven fields differs most often, across every run?**

```sql
select field, count(*) as differed
  from analytics.fact_field_diff
 where differed
 group by field
 order by differed desc
```

**How many emails needed a person, by reason, in run X?**

```sql
select review_reason, count(*) as emails
  from analytics.fact_email_outcome
 where run_id = 'X' and status = 'NEEDS_REVIEW'
 group by review_reason
 order by emails desc
```

**What did run X cost, and how long did an email take?**

```sql
select s.emails, s.llm_calls, round(s.llm_cost_usd, 4) as usd,
       round(avg(o.latency_ms)) as mean_ms
  from analytics.agg_run_stage s
  join analytics.fact_email_outcome o on o.run_id = s.run_id
 where s.run_id = 'X'
 group by s.emails, s.llm_calls, s.llm_cost_usd
```

**Which spellings were judged to be the same port?**

```sql
select e.canonical, n.value, n.seen_count, n.joined_by, n.confidence
  from core.entities e
  join core.entity_names n on n.entity_id = e.id
 where e.kind = 'port'
 order by e.mention_count desc, n.seen_count desc
```
