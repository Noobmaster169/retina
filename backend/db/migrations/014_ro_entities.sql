-- Phase 10: let the read-only role read the resolved ontology.
--
-- Migration 011 grants table by table, and it ran before 013 created
-- core.entities, core.entity_names and core.entity_mentions. A grant cannot
-- name a table that does not exist yet, so the three tables the ontology is
-- made of were the three the chat agent could not read, while
-- src/agents/chat/schema-docs.md told it they were there and offered a query
-- over them as one of its five examples. It answered `permission denied for
-- table entities`.
--
-- The lesson, written down here because the next phase will add a table too:
-- a grant in an earlier migration does not reach a table added by a later
-- one, and `alter default privileges` only covers what the role that ran it
-- creates afterwards. A new table read by the agent needs a new grant, in the
-- same commit as the table.
--
-- Additive and idempotent: granting twice is not an error, and a rollback to
-- phase 9 leaves a privilege on tables that image does not know about.

grant select on core.entities to retina_ro;
grant select on core.entity_names to retina_ro;
grant select on core.entity_mentions to retina_ro;

-- So a table added by a later migration of this schema is readable without
-- another of these. It applies only to tables created from now on by the role
-- running migrations, which is the one that creates all of them.
alter default privileges in schema core grant select on tables to retina_ro;
