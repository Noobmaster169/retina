-- Phase 10f: the order a concept question takes candidates in.
--
-- Over the judge budget, `find_entities` takes the best candidates by how well
-- their profile matches the concept's search terms, then tops the list up with
-- the most-seen things of that kind. The first leg is served by the GIN index
-- on `search`; the second was a sequential scan and a top-N sort over every
-- thing of the kind, which `pnpm ontology:bench` showed at 200,000.
--
-- The expression is `mention_count + sighting_count`, which is how much
-- evidence a thing holds from either source, and it has to be written here
-- exactly as the query writes it for the index to be used.
--
-- Additive: one index.

create index entities_ranked on core.entities (kind, ((mention_count + sighting_count)) desc, id)
  where merged_into is null;
