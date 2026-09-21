-- Business-data fix session: a port is unique by its UN/LOCODE.
--
-- Two spellings the world's port list places at one code are one port, and
-- the resolver now joins them the way it joins a judge's pair. The join needs
-- its own name on the spelling, because the screen says how each one joined
-- and "same thing, 0.97" would be a claim no model made. Widening a check is
-- expand-only: the previous image writes nothing but the three old values.
alter table core.entity_names drop constraint entity_names_joined_by_check;
alter table core.entity_names
  add constraint entity_names_joined_by_check check (joined_by in ('kept', 'judge', 'human', 'reference'));
