-- Phase 13: a person may correct a resolved thing from the interface.
--
-- `human_name` is the name a person chose; the resolver keeps it as the
-- canonical on every pass instead of the most-seen spelling. `edited_by` and
-- `edited_at` say who last touched the thing's attributes or name. Additive
-- with nulls, so the previous image reads nothing new and writes none of it.
alter table core.entities
  add column human_name text,
  add column edited_by  text,
  add column edited_at  timestamptz;

comment on column core.entities.human_name is
  'The name a person chose from the interface. applyResolution keeps it as canonical; the most-seen spelling no longer decides.';
