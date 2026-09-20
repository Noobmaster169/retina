-- Phase 10e: a turn's steps are readable while the turn is still running.
--
-- The loop writes one `role = 'tool'` row per finished call as it finishes,
-- and the page polls for rows newer than the question it asked. That is the
-- whole of "you see each step": no queue, no stream, and the POST still holds
-- until the answer, so nothing is fire-and-forget.
--
-- `in_reply_to` ties those rows to the question they serve, which is what lets
-- a reader tell this turn's steps from the previous turn's and lets the page
-- drop them once the assistant turn lands. Null on every row written before
-- this migration, and on the user and assistant turns themselves.
--
-- Additive only: nullable, no default, no backfill. The image a rollback
-- restores selects its columns by name and never sees this one.

alter table core.chat_turns
  add column if not exists in_reply_to bigint references core.chat_turns(id) on delete cascade;

-- The page's poll is "rows of this conversation newer than that id", which the
-- existing (conversation_id, id) index already serves. This one is for reading
-- a question's steps back afterwards, which the trace does not yet do and the
-- lesson drafter in phase 11 will.
create index if not exists chat_turns_in_reply_to on core.chat_turns (in_reply_to) where in_reply_to is not null;
