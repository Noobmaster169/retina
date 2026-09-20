-- Phase 10f: room on the things that already exist.
--
-- Only widens and adds. It ships with code that reads the new values and
-- writes none of them, because a rollback restores the previous image and that
-- image's zod enums do not know `carrier`: a row it cannot parse is worse than
-- a column it ignores. The code that writes a new kind follows in a later
-- commit, once this has deployed cleanly. See deploy/README.md.
--
-- Four kinds are added. They are not new sources of truth: a carrier, a
-- vessel, a commodity and a person are stated in a subject line, a body or the
-- rest of a document as plainly as a consignee is on a shipping instruction,
-- and the only reason they were not here is that nothing read them.

alter table core.entities drop constraint entities_kind_check;
alter table core.entities add constraint entities_kind_check
  check (kind in ('port', 'party', 'carrier', 'person', 'commodity', 'vessel'));

alter table core.entities
  -- Set on the loser of a merge. Its row stays so a stored verdict or a
  -- remembered grounding can follow it to the survivor instead of breaking.
  add column merged_into        bigint references core.entities(id) on delete cascade,
  -- What this thing is, by kind, under a zod schema per kind in contracts.ontology.ts.
  add column attributes         jsonb not null default '{}'::jsonb,
  -- The same keys, each with where the value came from:
  -- { "region": { "source": "model", "confidence": 0.98, "llmCallId": 812 } }.
  add column attributes_source  jsonb not null default '{}'::jsonb,
  add column profile_md         text,
  -- Rises by one on every rewrite. A concept verdict stores the version it
  -- read, which is how a verdict goes stale honestly instead of silently.
  add column profile_version    int not null default 0,
  add column profile_updated_at timestamptz,
  add column stale              boolean not null default true,
  -- How many times this thing was read somewhere no extraction field reaches:
  -- a subject, a body, a forwarded header, the rest of a document.
  add column sighting_count     int not null default 0,
  add column search_text        text not null default '',
  add column search             tsvector generated always as (to_tsvector('simple', search_text)) stored;

-- A tombstone keeps its row, and a merge usually hands the survivor the
-- canonical spelling the loser held, so `(kind, canonical)` collides on
-- exactly the pair the merge created. The uniqueness that matters is among the
-- things that still denote something.
alter table core.entities drop constraint entities_kind_canonical_key;
create unique index entities_kind_canonical on core.entities (kind, canonical) where merged_into is null;

create index entities_search on core.entities using gin (search);
create index entities_region on core.entities (kind, (attributes->>'region')) where merged_into is null;
create index entities_country on core.entities (kind, (attributes->>'country')) where merged_into is null;
-- Never profiled first, then oldest: the order the refresh job takes them in.
create index entities_stale on core.entities (profile_updated_at nulls first) where stale and merged_into is null;

-- Which judge joined a spelling. `joined_by` stays kept | judge | human, so the
-- older image still parses it; this says which step wrote the `judge`, and is
-- null for the field judge, which is the one that has always been here.
alter table core.entity_names add column joined_step text;

comment on column core.entities.merged_into is
  'Set by pipeline/ontology/reconcile.ts when a new verdict joined two things. Every read of core.entities filters `merged_into is null`; get_entity follows it.';
