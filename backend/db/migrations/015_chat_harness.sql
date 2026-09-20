-- Phase 10d: what the chat's exploration tools search, and where a
-- conversation keeps its first look at the database.
--
-- Additive only. The image a rollback restores never reads the new column or
-- the new indexes, and a generated column needs no writer.

create extension if not exists pg_trgm;

-- `find_entity` proposes candidates by similarity over every spelling. It never
-- merges two of them: resolve.ts still joins spellings on the field judge's
-- verdict and nothing else. `entities.replaceAll` deletes rows, not tables, so
-- these survive every refresh.
create index if not exists entity_names_trgm on core.entity_names using gin (value gin_trgm_ops);
create index if not exists entity_names_lower on core.entity_names (lower(value));

-- 'simple' and not 'english': a reference such as 5RFR-36541 and a vessel name
-- must be found as written, not stemmed into something else.
alter table core.emails
  add column if not exists search tsvector
  generated always as (to_tsvector('simple', coalesce(subject, '') || ' ' || coalesce(body, ''))) stored;
create index if not exists emails_search on core.emails using gin (search);
create index if not exists emails_subject_trgm on core.emails using gin (subject gin_trgm_ops);

-- What the database held when the conversation opened, and the watermark it
-- was read at, so a later turn recomputes it only when the derived data moved.
alter table core.chat_conversations add column if not exists orientation jsonb;

comment on column core.chat_conversations.orientation is
  'The rendered first look (src/agents/chat/orientation.ts) and the derived-data watermark it was read at. Rebuildable; null until the first turn.';
