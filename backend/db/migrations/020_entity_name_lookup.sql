-- Phase 10f: the one spelling lookup 015 did not index.
--
-- 015 added a trigram index and a `lower(value)` index for the chat's
-- candidate search. The semantic layer reads `core.entity_names` a third way,
-- on every sighting of every email: is this exact spelling already a name of
-- something? That was a sequential scan, and `pnpm ontology:bench` is what
-- made it visible at 200,000 things.
--
-- Additive: one index. A rollback reads the same rows more slowly.

create index if not exists entity_names_value on core.entity_names (value);
