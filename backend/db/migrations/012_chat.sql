-- Phase 10: the conversations, and every turn of them.
--
-- A turn is a row whether a person wrote it, the agent answered it, or a tool
-- returned it. Storing the tool turns is not bookkeeping: the chat's claim is
-- that it did not make the number up, and the evidence for that claim is the
-- query it ran and the rows that came back, kept beside the sentence.
--
-- Additive only: a rollback to phase 9 reads neither table.

create table core.chat_conversations (
  id          uuid primary key,
  title       text,
  -- What the conversation can see, which the rail draws as its scope chips. A
  -- conversation about one email carries both; one about an inbox carries the
  -- run alone; one about the whole model carries neither. The agent's tools
  -- read these as defaults, never as a filter a question cannot widen.
  run_id      uuid references core.runs(id) on delete cascade,
  email_id    text references core.emails(email_id),
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on core.chat_conversations (created_at desc);
create index on core.chat_conversations (run_id, created_at desc);

create table core.chat_turns (
  id               bigserial primary key,
  conversation_id  uuid not null references core.chat_conversations(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant', 'tool')),
  content          text not null,
  -- Set on a tool turn and null on the other two. The result is stored already
  -- truncated: what the agent saw is what the page shows, so a reader and the
  -- model are never looking at different evidence.
  tool_name        text,
  tool_args        jsonb,
  tool_result      jsonb,
  duration_ms      int,
  -- The SQL an assistant turn reported running, in the order it ran. Kept on
  -- the turn as well as on the tool rows so the page can draw the block
  -- without replaying the loop.
  sql_used         text[] not null default '{}',
  -- Which rows of core.llm_calls this turn cost. Every loop iteration is one.
  llm_call_ids     bigint[] not null default '{}',
  created_at       timestamptz not null default now(),
  check ((role = 'tool') = (tool_name is not null))
);
create index on core.chat_turns (conversation_id, id);
