-- Each resume starts a new ingest job. The epoch says which job owns the run,
-- so an older job that is still waiting or sleeping stands down instead of
-- ingesting alongside the new one.

alter table core.runs add column ingest_epoch int not null default 0;
