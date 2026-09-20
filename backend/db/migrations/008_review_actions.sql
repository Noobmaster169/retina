-- Phase 8: what a person did to a case, the documents they supplied, and the
-- reruns their corrections set off.
--
-- Additive only and expand/contract safe: nothing is renamed or dropped, every
-- added column carries a default, and a rollback to phase 7 reads none of them.
--
-- A row here is also a labelled example. Phase 11's drafting job reads this
-- table to propose lessons, so `kind` says which step a person corrected and
-- `note` stays free text.

create table core.review_actions (
  id              bigserial primary key,
  review_case_id  bigint not null references core.review_cases(id) on delete cascade,
  email_run_id    bigint not null references core.email_runs(id) on delete cascade,
  -- Ours, not an organiser enum. A failure is answered with `retry`, never with
  -- a review_reason.
  kind            text not null check (kind in ('confirm','correct_field','reclassify','note','upload','retry','reopen')),
  -- The organisers' seven fields, value for value, on a correct_field.
  field           text check (field in ('shipper','consignee','notify_party','port_of_loading','port_of_discharge','container_count','gross_weight_kg')),
  side            text check (side in ('SI','BL')),
  old_value       text,
  new_value       text,
  note            text,
  -- The reviewer's name, typed once into the UI. There are no accounts in this build.
  actor           text not null,
  created_at      timestamptz not null default now()
);
create index on core.review_actions (email_run_id);
create index on core.review_actions (kind, created_at);

-- A document a person supplied for a case, so triage can prefer it over the
-- one the sender attached without guessing which arrived later.
alter table core.attachments add column review_case_id bigint references core.review_cases(id);

-- How many times a person has sent this email back through the pipeline. The
-- rerun's job id carries it, so BullMQ sees a new job rather than a duplicate.
alter table core.email_runs add column rerun_count int not null default 0;

-- Which layer settled the comparison. Ours, not an organiser enum: the
-- submission's own decided_by is the organisers' ('rule' or 'llm') and never
-- carries this. A person who confirms an escalation confirms that escalating
-- was right; they never mark one document correct.
alter table core.comparisons add column decided_by text not null default 'llm' check (decided_by in ('llm','human'));
