-- Phase 10f: which concepts are worth finishing in the background.
--
-- A question over budget judges the best candidates and leaves the rest. Some
-- of those are worth finishing and most are not: a one-off phrase somebody
-- tried once should cost one batch and stop, and a phrase asked twice or asked
-- a total over should end up complete. `asked_count` says the first; this says
-- the second, which is the `needComplete` a tool call carries.
--
-- Additive. The image before it reads the column not at all and the backfill
-- simply does not run.

alter table core.concepts add column backfill_wanted boolean not null default false;
create index concepts_backfill on core.concepts (id) where backfill_wanted;
