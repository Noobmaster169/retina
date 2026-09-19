-- Phase 2: what the pipeline decided about each email in a run, every LLM call
-- it made to decide it, and what was sent to the scorer.
--
-- category, status and review_reason are the organisers' enums, value for
-- value (emails/data_v2/README.md, emails/server/scoring.py). The two table
-- checks on comparisons are the README's status table: a reason exactly when
-- the status is NEEDS_REVIEW, a defect exactly when it is MISMATCH.

create table core.classifications (
  id              bigserial primary key,
  email_run_id    bigint not null unique references core.email_runs(id) on delete cascade,
  gen_category    text check (gen_category in ('BL_COMPARISON','SI_REQUEST','INVOICE_QUERY','GENERAL','SPAM')),
  gen_confidence  numeric,
  ver_category    text check (ver_category in ('BL_COMPARISON','SI_REQUEST','INVOICE_QUERY','GENERAL','SPAM')),
  ver_confidence  numeric,
  final_category  text not null check (final_category in ('BL_COMPARISON','SI_REQUEST','INVOICE_QUERY','GENERAL','SPAM')),
  human_category  text check (human_category in ('BL_COMPARISON','SI_REQUEST','INVOICE_QUERY','GENERAL','SPAM')),
  -- Ours, not an organiser enum: which layer settled the category.
  decided_by      text not null check (decided_by in ('llm','verifier','human')),
  rationale       jsonb not null default '{}'::jsonb,
  model           text,
  prompt_version  text,
  created_at      timestamptz not null default now()
);

create table core.comparisons (
  id             bigserial primary key,
  email_run_id   bigint not null unique references core.email_runs(id) on delete cascade,
  status         text not null check (status in ('OK','MISMATCH','NEEDS_REVIEW')),
  review_reason  text check (review_reason in ('wrong_doc_type','missing_attachment','unreadable','missing_value')),
  has_defect     boolean not null default false,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  check ((status = 'NEEDS_REVIEW') = (review_reason is not null)),
  check ((status = 'MISMATCH') = has_defect)
);

-- Append-only: one row per attempt, ok or not.
create table core.llm_calls (
  id             bigserial primary key,
  email_run_id   bigint references core.email_runs(id) on delete cascade,
  run_id         uuid references core.runs(id) on delete cascade,
  step           text not null,
  model          text not null,
  prompt_version text not null,
  request        jsonb not null,
  response       jsonb,
  parsed         jsonb,
  input_tokens   int,
  output_tokens  int,
  cost_usd       numeric,
  latency_ms     int not null,
  ok             boolean not null,
  error          text,
  attempt        int not null default 1,
  created_at     timestamptz not null default now()
);
create index on core.llm_calls (email_run_id);
create index on core.llm_calls (run_id, step);

create table core.submissions (
  id           bigserial primary key,
  run_id       uuid not null references core.runs(id) on delete cascade,
  payload_key  text not null,
  scoreboard   jsonb,
  final_score  numeric,
  n_emails     int not null,
  forced       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on core.submissions (run_id, created_at desc);
