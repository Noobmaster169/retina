-- Phase 5: every attachment as the parser saw it, the model's word on what
-- each document is, and the cases that need a human.
--
-- Additive only: a rollback to phase 4 never reads these tables, and the new
-- prompt steps' rows are unknown to it and ignored.

create table core.documents (
  id                  bigserial primary key,
  email_run_id        bigint not null references core.email_runs(id) on delete cascade,
  attachment_id       bigint not null references core.attachments(id) on delete cascade,
  -- What the filename claims the document is.
  role                text not null check (role in ('SI','BL','UNKNOWN')),
  -- What the model says it is, once it has read the text. Null until then, and
  -- for a document that could not be read. Ours, not an organiser enum.
  doc_type            text check (doc_type in ('SI','BL','INVOICE','PACKING_LIST','COO','OTHER')),
  doc_type_confidence numeric,
  doc_type_rationale  text,
  format              text not null check (format in ('txt','pdf','docx','xlsx','unknown')),
  text_object_key     text,
  pages               int not null default 0,
  scanned             boolean not null default false,
  unreadable          boolean not null default false,
  warnings            jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  unique (email_run_id, attachment_id)
);

create table core.review_cases (
  id            bigserial primary key,
  email_run_id  bigint not null references core.email_runs(id) on delete cascade,
  -- 'review' carries one of the organisers' four reasons. 'failure' (a job
  -- that failed for good, phase 8) carries none: a failure is not a review_reason.
  kind          text not null default 'review' check (kind in ('review','failure')),
  reason        text check (reason in ('wrong_doc_type','missing_attachment','unreadable','missing_value')),
  check ((kind = 'review') = (reason is not null)),
  stage         text not null,
  detail        jsonb not null default '{}'::jsonb,
  status        text not null default 'open' check (status in ('open','resolved')),
  opened_at     timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   text
);
create index on core.review_cases (status, reason);
create unique index review_cases_one_open on core.review_cases (email_run_id) where status = 'open';

insert into core.prompt_versions (step, version, active, notes) values
  ('triage', 'v1', true, 'Phase 5: what a comparison request with nothing attached is asking for'),
  ('doc-type', 'v1', true, 'Phase 5: what kind of document an attachment is, from its text'),
  ('classify', 'v5', false, 'Phase 5: v3 plus the attachments'' extracted text as context. Active once a holdout run shows it helps'),
  ('classify-verify', 'v2', false, 'Phase 5: v1 plus the attachments'' extracted text, to pair with classify v5');
