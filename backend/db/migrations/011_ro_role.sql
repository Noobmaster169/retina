-- Phase 10: the role the chat agent's SQL runs as.
--
-- `run_sql` puts a model-written query in front of the database. The guardrail
-- in src/agents/chat/tools/run-sql.ts rejects writes before they are sent, and
-- this role means a query that somehow got past it still cannot do anything:
-- no write privilege, a read-only transaction by default, and a 5 second
-- statement timeout. Two independent stops, because one of them is a regex
-- over text a model wrote.
--
-- `:'ro_password'` is substituted by db/migrate.mjs from PG_RO_PASSWORD. It is
-- the one templated migration in the repo; a password does not belong in git.
--
-- Additive only. A rollback to phase 9 leaves the role in place with nothing
-- using it, which costs nothing and breaks nothing.

do $$
begin
  if not exists (select from pg_roles where rolname = 'retina_ro') then
    create role retina_ro login password :'ro_password';
  else
    alter role retina_ro login password :'ro_password';
  end if;
end $$;

grant usage on schema core to retina_ro;
grant usage on schema analytics to retina_ro;

-- Named one by one rather than `on all tables in schema`, because that form's
-- treatment of materialized views has changed between server versions and
-- because the list is the documentation of what the agent may read.
grant select on analytics.fact_email_outcome to retina_ro;
grant select on analytics.fact_field_diff to retina_ro;
grant select on analytics.agg_client_run to retina_ro;
grant select on analytics.agg_run_stage to retina_ro;
grant select on analytics.dim_client to retina_ro;
grant select on analytics.dim_run to retina_ro;

grant select on core.runs to retina_ro;
grant select on core.clients to retina_ro;
grant select on core.emails to retina_ro;
grant select on core.email_runs to retina_ro;
grant select on core.attachments to retina_ro;
grant select on core.documents to retina_ro;
grant select on core.classifications to retina_ro;
grant select on core.extractions to retina_ro;
grant select on core.extraction_fields to retina_ro;
grant select on core.comparisons to retina_ro;
grant select on core.field_diffs to retina_ro;
grant select on core.review_cases to retina_ro;
grant select on core.review_actions to retina_ro;
grant select on core.submissions to retina_ro;
grant select on core.prompt_versions to retina_ro;

-- llm_calls by column. `request`, `response` and `parsed` hold the prompt text
-- and the model's raw answer; an agent that could read them could read a
-- previous conversation's contents through a SELECT, and the cost and latency
-- columns are what a question about model spend actually needs.
grant select (
  id, email_run_id, run_id, step, model, prompt_version,
  input_tokens, output_tokens, cost_usd, latency_ms, ok, error, attempt, created_at
) on core.llm_calls to retina_ro;

-- Future analytics views are readable without another migration. Applies only
-- to objects created by the role running this, which is the migration user.
alter default privileges in schema analytics grant select on tables to retina_ro;

alter role retina_ro set statement_timeout = '5s';
alter role retina_ro set default_transaction_read_only = on;
alter role retina_ro set search_path = analytics, core, pg_catalog;
