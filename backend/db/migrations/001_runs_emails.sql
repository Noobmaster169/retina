-- Phase 1: a run, the emails it replays, where each email is in the pipeline,
-- and the attachments copied into object storage. Every table lives in `core`
-- and every query names the schema; search_path is never relied on.

create schema if not exists core;

create table core.runs (
  id               uuid primary key,
  source           text not null,
  rate_per_second  numeric not null default 0,
  email_limit      int,
  email_ids        text[],
  status           text not null check (status in ('created','running','paused','completed','cancelled','failed')),
  total_emails     int,
  prompt_set       jsonb not null default '{}'::jsonb,
  created_by       text,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz
);

create table core.clients (
  domain      text primary key,
  name        text,
  tier        smallint not null default 3 check (tier between 1 and 5),
  kind        text not null default 'customer' check (kind in ('customer','internal','forwarder','spam')),
  updated_at  timestamptz not null default now()
);

-- Content is identical across runs, so an email is stored once.
create table core.emails (
  email_id          text primary key,
  from_addr         text not null,
  sender_domain     text not null,
  subject           text not null,
  body              text not null,
  attachment_paths  text[] not null default '{}',
  tonnage_mt        int,
  raw               jsonb not null,
  first_seen_at     timestamptz not null default now()
);
create index on core.emails (sender_domain);

create table core.email_runs (
  id           bigserial primary key,
  run_id       uuid not null references core.runs(id) on delete cascade,
  email_id     text not null references core.emails(email_id),
  stage        text not null check (stage in ('ingested','classifying','classified','comparing','review','done','failed')),
  priority     int not null default 600,
  attempt      int not null default 0,
  outcome      text,
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  unique (run_id, email_id)
);
create index on core.email_runs (run_id, stage);

create table core.attachments (
  id            bigserial primary key,
  run_id        uuid not null references core.runs(id) on delete cascade,
  email_id      text not null references core.emails(email_id),
  filename      text not null,
  source_path   text not null,
  role          text check (role in ('SI','BL','UNKNOWN')),
  origin        text not null default 'source' check (origin in ('source','human')),
  object_key    text not null,
  content_type  text not null,
  bytes         int not null,
  sha256        text not null,
  created_at    timestamptz not null default now(),
  unique (run_id, email_id, filename)
);
