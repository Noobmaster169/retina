-- Phase 10: the query surface the chat agent reads.
--
-- `core` is the shape the pipeline writes; `analytics` is the shape a question
-- is asked in. One row per email per run, one row per field judgement, and two
-- rollups. Nothing here is a source of truth: every view is derived and can be
-- dropped and rebuilt from `core` alone.
--
-- Additive only: a rollback to phase 9 reads none of this, and a schema it does
-- not know about is a schema it never names.
--
-- Five things the phase 10 spec got wrong are corrected here and in
-- docs/phases/phase-10-analytics-and-chat.md, per CLAUDE.md rule 5. They are
-- called out at the line that fixes each one.

create schema if not exists analytics;

-- Correction 4 of 5. The spec hardcoded `coalesce(cl.tier, 3)`, which is the
-- same number DEFAULT_TIER holds in src/contracts.clients.ts with nothing
-- tying them together. This function is the tie: the view reads it, and
-- test/analytics.test.ts asserts it equals DEFAULT_TIER, so the two cannot
-- drift without a test going red.
create or replace function core.default_tier() returns smallint
  language sql immutable parallel safe
  as $$ select 3::smallint $$;

comment on function core.default_tier() is
  'What a sender nobody has ranked is worth. Mirrored by DEFAULT_TIER in src/contracts.clients.ts; analytics.test.ts holds them equal.';

-- One row per email per run: what the pipeline decided, what it cost, and how
-- long it took. The grain is (run_id, email_id), which is also email_runs'
-- unique key, so a join back to core never fans out.
create materialized view analytics.fact_email_outcome as
select er.run_id,
       er.email_id,
       er.id as email_run_id,
       e.sender_domain,
       coalesce(cl.tier, core.default_tier()) as client_tier,
       cl.name as client_name,
       e.subject,
       e.tonnage_mt,
       -- A person's correction wins over the pipeline's answer wherever both
       -- exist, which is the same precedence the trace and the submission use.
       coalesce(c.human_category, c.final_category) as category,
       c.decided_by as category_decided_by,
       c.final_category as model_category,
       cmp.status,
       cmp.review_reason,
       cmp.has_defect,
       cmp.decided_by as comparison_decided_by,
       (select count(*) from core.field_diffs fd
         where fd.comparison_id = cmp.id and not fd.same and not fd.missing) as n_defects,
       (select count(*) from core.llm_calls l where l.email_run_id = er.id) as llm_calls,
       (select coalesce(sum(l.cost_usd), 0) from core.llm_calls l where l.email_run_id = er.id) as llm_cost_usd,
       er.stage,
       er.started_at,
       er.finished_at,
       extract(epoch from (er.finished_at - er.started_at)) * 1000 as latency_ms,
       exists (select 1 from core.review_actions ra where ra.email_run_id = er.id) as human_touched
  from core.email_runs er
  join core.emails e on e.email_id = er.email_id
  left join core.clients cl on cl.domain = e.sender_domain
  left join core.classifications c on c.email_run_id = er.id
  left join core.comparisons cmp on cmp.email_run_id = er.id;

create unique index fact_email_outcome_pk on analytics.fact_email_outcome (run_id, email_id);
create index fact_email_outcome_domain on analytics.fact_email_outcome (run_id, sender_domain);

comment on materialized view analytics.fact_email_outcome is
  'One row per email per run. Grain (run_id, email_id). n_defects counts field judgements that differed, not every judgement.';

-- One row per field judgement. All seven per comparison, not only the ones
-- that differed: a question about what agreed is as legitimate as one about
-- what did not.
--
-- Correction 2 of 5. The spec selected `fd.judge_used`, a column that does not
-- exist and never has, so the view would not have created. The real columns
-- are same, missing, confidence and rationale. `judged` below is the honest
-- reading of "did a model judge this pair": the field judge is the only thing
-- that writes a rationale, so a rationale means it ran.
create materialized view analytics.fact_field_diff as
select er.run_id,
       er.email_id,
       e.sender_domain,
       fd.comparison_id,
       fd.field,
       fd.si_value,
       fd.bl_value,
       fd.same,
       fd.missing,
       fd.confidence,
       fd.rationale is not null as judged,
       not fd.same and not fd.missing as differed
  from core.field_diffs fd
  join core.comparisons cmp on cmp.id = fd.comparison_id
  join core.email_runs er on er.id = cmp.email_run_id
  join core.emails e on e.email_id = er.email_id;

create unique index fact_field_diff_pk on analytics.fact_field_diff (run_id, email_id, field);
create index fact_field_diff_field on analytics.fact_field_diff (run_id, field) where not same and not missing;

comment on column analytics.fact_field_diff.judged is
  'The field judge wrote a rationale for this pair, so a model compared the two values. Not the same as differed.';

-- Correction 5 of 5. The spec's dim_client was `select domain, name, tier,
-- kind from core.clients`, which sees only senders somebody has ranked. The
-- /clients page deliberately drives off core.emails so an unranked sender is
-- still on it, and a chat answer that disagreed with that page would be a bug
-- nobody could explain. This is clients.repo.ts:list as a view.
create view analytics.dim_client as
with sent as (
  select e.sender_domain as domain,
         count(distinct e.email_id) as emails,
         count(distinct e.email_id) filter (
           where c.status = 'MISMATCH' and not (c.detail ? 'awaiting_draft')
         ) as mismatches
    from core.emails e
    left join core.email_runs er on er.email_id = e.email_id
    left join core.comparisons c on c.email_run_id = er.id
   group by e.sender_domain
)
select coalesce(cl.domain, sent.domain) as domain,
       cl.name,
       coalesce(cl.tier, core.default_tier()) as tier,
       coalesce(cl.kind, 'customer') as kind,
       cl.tier is not null as known,
       coalesce(sent.emails, 0) as emails,
       coalesce(sent.mismatches, 0) as mismatches
  from sent
  full outer join core.clients cl on cl.domain = sent.domain;

comment on view analytics.dim_client is
  'Every sender seen plus every client ranked. `known` is false for a domain that has emailed but that nobody has ranked; its tier and kind are the defaults.';

create view analytics.dim_run as
select r.id,
       r.status,
       r.rate_per_second,
       r.total_emails,
       r.prompt_set,
       r.created_at,
       r.started_at,
       r.finished_at,
       (select s.final_score from core.submissions s
         where s.run_id = r.id order by s.created_at desc limit 1) as final_score
  from core.runs r;

create materialized view analytics.agg_client_run as
select o.run_id,
       o.sender_domain,
       o.client_name,
       o.client_tier,
       count(*) as emails,
       count(*) filter (where o.category = 'BL_COMPARISON') as comparisons,
       count(*) filter (where o.status = 'MISMATCH') as mismatches,
       count(*) filter (where o.status = 'NEEDS_REVIEW') as reviews,
       count(*) filter (where o.human_touched) as human_touched,
       coalesce(sum(o.llm_cost_usd), 0) as llm_cost_usd,
       (select f.field from analytics.fact_field_diff f
         where f.run_id = o.run_id and f.sender_domain = o.sender_domain
           and not f.same and not f.missing
         group by f.field order by count(*) desc, f.field asc limit 1) as top_defect_field
  from analytics.fact_email_outcome o
 group by o.run_id, o.sender_domain, o.client_name, o.client_tier;

create unique index agg_client_run_pk on analytics.agg_client_run (run_id, sender_domain);

-- Correction 3 of 5. The spec counted `decided_by = 'rule'`, which is a value
-- neither decided_by column has: classifications.decided_by is
-- llm|verifier|human and comparisons.decided_by is llm|human. The organisers'
-- submission enum has `rule`, and that is the only place the word belongs. A
-- count of rule-decided emails is a count of something this product does not
-- do on purpose, so the column is gone rather than reported as 0 forever.
create materialized view analytics.agg_run_stage as
select run_id,
       count(*) as emails,
       count(*) filter (where stage = 'done') as done,
       count(*) filter (where stage = 'review') as review,
       count(*) filter (where stage = 'failed') as failed,
       count(*) filter (where category_decided_by = 'verifier') as verifier_decided,
       count(*) filter (where category_decided_by = 'human') as human_decided,
       coalesce(sum(llm_cost_usd), 0) as llm_cost_usd,
       sum(llm_calls) as llm_calls,
       min(started_at) as first_at,
       max(finished_at) as last_at
  from analytics.fact_email_outcome
 group by run_id;

create unique index agg_run_stage_pk on analytics.agg_run_stage (run_id);
