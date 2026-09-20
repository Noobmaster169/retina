-- Phase 10f: the candidate search becomes a nearest-neighbour search.
--
-- `find_entity` looked for every spelling within a similarity of 0.3 of what
-- was typed. At fifty things that is nothing; at 200,000 it matched 23,000
-- rows and Postgres correctly chose a sequential scan, which
-- `pnpm ontology:bench` measured at 760 ms. A threshold is the wrong question
-- anyway: the tool shows eight candidates, so what it wants is the nearest
-- few, not everything over a line.
--
-- GiST rather than GIN, because only GiST serves `<->` and `<->>` as an
-- ordering: `order by value <-> $1 limit 50` becomes an index scan that stops
-- after fifty rows however large the table is. The GIN index from 015 stays:
-- it still serves the `%` containment the recipes and the profile column use.
--
-- Additive: one index. It is larger and slower to build than the GIN one, and
-- both together are still a few tens of megabytes at the sizes here.

create index entity_names_trgm_gist on core.entity_names using gist (value public.gist_trgm_ops);
