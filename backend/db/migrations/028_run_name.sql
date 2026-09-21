-- A run a person named. Null everywhere it was never named, which is every
-- run before this and every run nobody renames: the name a run is shown under
-- is still derived from when it started, and this only overrides it.
alter table core.runs add column if not exists name text;
