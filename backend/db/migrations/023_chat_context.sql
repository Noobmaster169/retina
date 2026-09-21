-- Phase 13: what the person was looking at when they asked.
--
-- Stored on the user turn, not the conversation: a person moves between pages
-- inside one conversation, and the context is whatever the page offered and
-- they attached at that moment. Additive with a default, so the 10f image
-- reads the column as nothing and writes none of it.
alter table core.chat_turns add column context jsonb not null default '[]'::jsonb;

comment on column core.chat_turns.context is
  'The refs the person attached to this question: [{ "kind": "party", "id": "12" }]. Read by agents/chat/context.ts, which turns each into one line of the scope.';
