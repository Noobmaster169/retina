-- A shipment is its members.
--
-- `key` is the member email ids, sorted and joined, so a regroup that finds
-- the same group again updates its row instead of inserting a second one, and
-- a link made to a shipment last week still opens the same thing. Without it
-- every regroup renumbered every shipment.
--
-- Nullable and indexed rather than `not null unique`, because the expand rule
-- forbids a `not null` without a default on a table an older image may still
-- be writing to. Nothing writes a shipment but the regroup, which always has
-- a key.
alter table core.shipments add column if not exists key text;
create unique index if not exists shipments_key on core.shipments (key);
