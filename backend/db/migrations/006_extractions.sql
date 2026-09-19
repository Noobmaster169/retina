-- Phase 6: what the model read from each document, with its evidence, and how
-- the field judge compared the two sides.
--
-- Additive only: a rollback to phase 5 never reads these tables, and the new
-- prompt steps' rows are unknown to it and ignored.

create table core.extractions (
  id              bigserial primary key,
  document_id     bigint not null unique references core.documents(id) on delete cascade,
  email_run_id    bigint not null references core.email_runs(id) on delete cascade,
  -- The place the document filled in the pair, after roles were resolved: not always what its name claims.
  role            text not null check (role in ('SI','BL')),
  prompt_version  text not null,
  model           text not null,
  -- Whether the verifier ran on this document. Its answer replaced the fields it was asked about.
  verified        boolean not null default false,
  created_at      timestamptz not null default now()
);
create index on core.extractions (email_run_id);

-- The seven fields are the organisers' (emails/data_v2/README.md), value for value.
create table core.extraction_fields (
  id             bigserial primary key,
  extraction_id  bigint not null references core.extractions(id) on delete cascade,
  field          text not null check (field in ('shipper','consignee','notify_party','port_of_loading','port_of_discharge','container_count','gross_weight_kg')),
  -- Verbatim from the document. Null where the label is absent or its value is a placeholder.
  value          text,
  -- The placeholder text found beside the label, when that is why value is null.
  placeholder    text,
  source_quote   text,
  confidence     numeric not null default 0,
  -- Whether the quote was found in the text and the value inside the quote.
  evidence_ok    boolean not null default false,
  -- A person's correction (phase 8). Read in place of value wherever both exist.
  human_value    text,
  note           text,
  unique (extraction_id, field)
);

-- Every field's judgement for a comparison, not only the differing ones: the
-- trace shows all seven. defect_fields is the rows with same and missing both false.
create table core.field_diffs (
  id             bigserial primary key,
  comparison_id  bigint not null references core.comparisons(id) on delete cascade,
  field          text not null check (field in ('shipper','consignee','notify_party','port_of_loading','port_of_discharge','container_count','gross_weight_kg')),
  si_value       text,
  bl_value       text,
  same           boolean not null,
  missing        boolean not null,
  confidence     numeric,
  rationale      text,
  unique (comparison_id, field)
);

insert into core.prompt_versions (step, version, active, notes) values
  ('extract', 'v1', true, 'Phase 6: the seven fields of one document, verbatim, each with a source quote'),
  ('extract-verify', 'v1', true, 'Phase 6: re-reads the fields whose quote was not found or whose confidence was low'),
  ('field-judge', 'v1', true, 'Phase 6: whether the SI and BL values of each field denote the same thing');
