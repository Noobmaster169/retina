-- Phase 10b: the things the model read out of documents, as things.
--
-- A port is not a row anybody typed. It exists because the extractor read a
-- value out of a document and the field judge said two spellings denote the
-- same place. That is the whole mechanism, and it is why `written these ways`
-- is the screen that makes the ontology's argument: every spelling on it
-- joined because a model judged it, never because a normaliser lowercased it
-- or a lookup table matched it. CLAUDE.md bans both, and nothing here does
-- either.
--
-- Two kinds are built: `port`, from port_of_loading and port_of_discharge, and
-- `party`, from shipper, consignee and notify_party. Shipment and Carrier are
-- in the design's vocabulary and are deliberately NOT here: nothing in the
-- organisers' seven fields yields a booking or a vessel, so building them
-- would mean inventing a source. They stay `planned` in the rail, drawn
-- dashed, which is the honest state.
--
-- Additive only: a rollback to phase 9 reads none of these tables, and the
-- resolver that fills them is a scheduled pass that simply stops running.

create table core.entities (
  id            bigserial primary key,
  kind          text not null check (kind in ('port', 'party')),
  -- The spelling kept: the one seen on the most documents in the cluster. Not
  -- a canonical form anybody wrote down, just the most common way it appears.
  canonical     text not null,
  mention_count int not null default 0,
  name_count    int not null default 0,
  first_seen_at timestamptz,
  last_seen_at  timestamptz,
  resolved_at   timestamptz not null default now(),
  unique (kind, canonical)
);

-- Every spelling that joined this thing, and why it joined. This is the table
-- `written these ways` reads.
create table core.entity_names (
  id          bigserial primary key,
  entity_id   bigint not null references core.entities(id) on delete cascade,
  value       text not null,
  seen_count  int not null default 0,
  -- `kept` is the canonical spelling itself. `judge` means the field judge
  -- compared this value with another in the cluster and said they denote the
  -- same thing, at `confidence`. `human` means a person's correct_field action
  -- joined them. There is no fourth way in, and in particular there is no
  -- string-similarity way in.
  joined_by   text not null check (joined_by in ('kept', 'judge', 'human')),
  confidence  numeric,
  unique (entity_id, value)
);
create index on core.entity_names (entity_id);

-- Every time this thing was read out of a document, and which of the seven
-- fields it filled there. `where it appeared` reads this joined back to the
-- extraction for the side and the email run for the outcome; nothing about the
-- email's fate is copied here, so the two can never disagree.
create table core.entity_mentions (
  id                  bigserial primary key,
  entity_id           bigint not null references core.entities(id) on delete cascade,
  extraction_field_id bigint not null references core.extraction_fields(id) on delete cascade,
  email_run_id        bigint not null references core.email_runs(id) on delete cascade,
  field               text not null check (field in ('shipper','consignee','notify_party','port_of_loading','port_of_discharge','container_count','gross_weight_kg')),
  value               text not null,
  unique (extraction_field_id)
);
create index on core.entity_mentions (entity_id, email_run_id);
create index on core.entity_mentions (email_run_id);

comment on table core.entities is
  'Resolved by src/pipeline/ontology/resolve.ts from extraction_fields and the field judge''s same-verdicts in field_diffs. Rebuildable: truncating these three tables and re-running the resolver restores them exactly.';
