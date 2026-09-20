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

Ours, not the organisers', and just as closed:

- `core.comparisons.decided_by`: `llm`, `human`
- `core.email_runs.outcome`: `not_comparable`, `OK`, `MISMATCH`, or one of the four review reasons
- `core.entities.kind`: `port`, `party`, `carrier`, `person`, `commodity`, `vessel`
- `core.entity_sightings.role`: `shipper`, `on_behalf_of`, `consignee`, `notify_party`,
  `port_of_loading`, `port_of_discharge`, `carrier`, `vessel`, `commodity`, `sender`, `signer`,
  `addressee`, `mentioned`; `source`: `subject`, `body`, `header`, `document`
- `core.concept_verdicts.verdict`: `yes`, `no`, `unknown`. `unknown` is "no basis either way",
  never a soft `no`. `matched` is a stored column equal to `verdict = 'yes'`, so a join needs no
  string literal
- `attributes->>'region'`: `Africa`, `Americas`, `Asia`, `Europe`, `Oceania`, the UN geoscheme's
  names. `subregion` is its next level down (`Western Asia`, `Northern Africa`, and so on)
- `core.entity_names.joined_by`: `kept` (the spelling seen most), `judge` (a model called it the
  same), `human`. `joined_step` says which judge: null for the field judge, `entity-resolve` for
  a spelling it never saw
- `core.extractions.role` and `core.documents.role`: `SI`, `BL`, `UNKNOWN`
- `core.documents.doc_type`: `SI`, `BL`, `INVOICE`, `PACKING_LIST`, `COO`, `OTHER`
- `core.review_cases.kind`: `review`, `failure`; `status`: `open`, `resolved`
- `core.review_actions.kind`: `confirm`, `correct_field`, `reclassify`, `note`, `upload`, `retry`, `reopen`
- `core.llm_calls.step`: `classify`, `classify-verify`, `triage`, `doc-type`, `extract`,
  `extract-verify`, `field-judge`, `chat`, `shipment-read`, `entity-resolve`, `entity-profile`,
  `concept-define`, `concept-judge`
- `core.runs.status`: `created`, `running`, `paused`, `completed`, `cancelled`, `failed`
- `core.documents.format`: `txt`, `pdf`, `docx`, `xlsx`, `unknown`
- `core.clients.kind`: `customer`, `internal`, `forwarder`, `spam`
- `core.attachments.origin`: `source`, `human`

## analytics.fact_email_outcome

One row per email per run. Grain `(run_id, email_id)`. Start here.

- `run_id`, `email_id`, `email_run_id`
- `sender_domain`, `client_tier` (1 first, 5 last; 3 where nobody ranked the sender), `client_name`
- `subject`, `tonnage_mt` (a number some subject lines carry; not the documented weight, and null on most emails)
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
`core.entities`, `core.entity_names`, `core.entity_mentions`,
`core.entity_sightings`, `core.email_shipments`, `core.concepts`,
`core.concept_verdicts`, and the view `core.entity_appearances`.

`core.entities` holds the six kinds of thing that have been read: ports and
parties out of the seven compared fields, and carriers, people, commodities and
vessels out of the mail itself. A spelling joins one only because a model said
it denotes the same thing; `core.entity_names.joined_by` and `joined_step` say
which judge, and there is no lookup table anywhere in this system.

`core.entity_mentions` has one row per extracted field per email run
(`entity_id`, `extraction_field_id`, `email_run_id`, `field`, `value`). An
email replayed in five runs has five sets, so an email count is
`count(distinct email_id)` through `core.email_runs`, never a count of
mentions. Prefer `core.entity_appearances`, which already counts one row per
email. Entity ids survive a refresh, so an id a tool returned on an earlier
turn is still that thing; a merged one keeps its row with `merged_into` set and
`get_entity` follows it.

## What the mail states, beyond the seven fields

`core.email_shipments` is one row per email, written from the mail itself and never scored:
`oc_no`, `bl_no`, `booking_ref`, `invoice_no`, `po_no`, `voyage`, `hs_code`, `container_count`,
`container_type`, `gross_weight_kg`, `trade_term`, `payment_term`, `bl_type`, `freight`,
`mail_date`, `disputed_fields`, `attributes`, and the entity ids `shipper_id`, `consignee_id`,
`notify_party_id`, `pol_id`, `pod_id`, `carrier_id`, `vessel_id`, `commodity_id`.

`mail_date` is the date the mail states in its own text and is null where it states none.
`core.emails.first_seen_at` is when we ingested it. Say which you filtered on.

`core.entity_sightings` is one row per thing per place it was read outside the seven fields
(`entity_id`, `email_id`, `role`, `source`, `surface`, `address`, `source_quote`, `ambiguous`).
`core.entity_appearances` unions it with `core.entity_mentions` under one name
(`entity_id`, `email_id`, `email_run_id`, `role`, `source`, `surface`, `address`, `disputed`).
`disputed` is true for the draft bill's side of a field the judge called different, so a question
about where cargo actually went filters `not disputed`.

`core.entities` also carries `attributes` and `attributes_source` (jsonb), `profile_md`,
`profile_version`, `stale` and `merged_into`. **Every query over it filters
`merged_into is null`**: a merged thing keeps its row so a stored verdict can follow it, and it
denotes nothing.

`core.emails.search` is a text-search column over subject and body. The
`search_emails` tool reads it for you; in SQL it is
`search @@ websearch_to_tsquery('simple', 'words')`.

## Example questions, and the SQL that answers them

A recipe covers most standard questions and is the first choice. These are for what the recipes do
not reach, and they show the views.

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

**Which ports did we ship to in Asia, and how many emails each? (class C)**

```sql
select p.canonical, p.attributes->>'country' as country, count(distinct s.email_id) as emails
  from core.email_shipments s
  join core.entities p on p.id = s.pod_id and p.merged_into is null
 where p.attributes->>'region' = 'Asia'
 group by p.canonical, p.attributes->>'country'
 order by emails desc
```

**Which customers did find_entities call distributors? (class D)**

```sql
select e.canonical, count(distinct a.email_id) as emails
  from core.entities e
  join core.entity_appearances a on a.entity_id = e.id
 where e.id in (select entity_id from core.concept_verdicts where concept_id = 12 and matched)
 group by e.canonical order by emails desc
```

**SI requests since January, by the date the mail states (class H)**

```sql
select count(*) filter (where s.mail_date >= date '2026-01-01') as since_january,
       count(*) filter (where s.mail_date is null) as no_date_stated
  from core.email_shipments s
  join core.email_runs er on er.email_id = s.email_id
  join core.classifications c on c.email_run_id = er.id
 where coalesce(c.human_category, c.final_category) = 'SI_REQUEST'
```

**Tonnage by month, over a concept (class K)**

```sql
select date_trunc('month', s.mail_date) as month, sum(s.gross_weight_kg) / 1000 as tonnes
  from core.email_shipments s
 where s.pod_id in (select entity_id from core.concept_verdicts where concept_id = 12 and matched)
   and s.mail_date is not null
 group by 1 order by 1
```

**Does anything here ship semiconductors? (class M)**

```sql
select e.canonical, v.verdict, v.rationale
  from core.concept_verdicts v
  join core.entities e on e.id = v.entity_id and e.merged_into is null
 where v.concept_id = 13
 order by v.verdict, e.canonical
```

The answer to that one is the counts: how many `yes`, how many `no`, and how many `unknown`. A
`no` and an `unknown` are different sentences, and so are "none of these" and "we do not know".

**Which spellings were judged to be the same port?**

```sql
select e.canonical, n.value, n.seen_count, n.joined_by, n.confidence
  from core.entities e
  join core.entity_names n on n.entity_id = e.id
 where e.kind = 'port'
 order by e.mention_count desc, n.seen_count desc
```
