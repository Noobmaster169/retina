-- Phase 4: which prompt version each LLM step runs by default. The prompt text
-- stays on disk under src/agents/prompts/<step>/<version>.md; this table only
-- says which of those files is live, so switching needs no deploy. A run pins
-- its versions in runs.prompt_set when it is created.
--
-- Additive only: the code this would roll back to never reads the table.

create table core.prompt_versions (
  step        text not null,
  version     text not null,
  active      boolean not null default false,
  model       text,
  notes       text,
  created_at  timestamptz not null default now(),
  primary key (step, version)
);
create unique index prompt_versions_one_active on core.prompt_versions (step) where active;

insert into core.prompt_versions (step, version, active, notes) values
  ('classify', 'v3', true, 'Phase 2 final: stage 1 macro-F1 1.0000 on the holdout, 0.9975 on all 520'),
  ('classify-verify', 'v1', true, 'Phase 4: runs when the generator is below VERIFY_BELOW');
