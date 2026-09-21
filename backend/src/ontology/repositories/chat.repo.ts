import { randomUUID } from "node:crypto";

import type { ChatConversation, NewConversation } from "../../contracts";
import type { Queryable } from "../../db";

export * from "./chat.turns";

/**
 * Conversations and their turns.
 *
 * A tool turn is a row like any other. Storing it is not bookkeeping: the
 * chat's claim is that it did not make the number up, and the evidence for
 * that is the query it ran and the rows that came back, kept beside the
 * sentence and reloaded with it.
 */

interface ConversationRow {
  id: string;
  title: string | null;
  run_id: string | null;
  email_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  turn_count?: string;
}


/** The `Reading` chips: exactly what this conversation can see, named in the words the rail shows. */
function chipsFor(row: ConversationRow): { label: string; memory: boolean }[] {
  const chips: { label: string; memory: boolean }[] = [];
  if (row.email_id) chips.push({ label: row.email_id, memory: false });
  if (row.run_id) chips.push({ label: `run ${row.run_id.slice(0, 8)}`, memory: false });
  if (!row.email_id && !row.run_id) chips.push({ label: "every run", memory: false });
  return chips;
}

function toConversation(row: ConversationRow): ChatConversation {
  return {
    id: row.id,
    title: row.title,
    scope: { runId: row.run_id, emailId: row.email_id, chips: chipsFor(row) },
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    turnCount: Number(row.turn_count ?? 0),
  };
}


export async function create(db: Queryable, body: NewConversation): Promise<ChatConversation> {
  const { rows } = await db.query<ConversationRow>(
    `insert into core.chat_conversations (id, title, run_id, email_id, created_by)
     values ($1::uuid, $2::text, $3::uuid, $4::text, $5::text)
     returning id, title, run_id, email_id, created_by, created_at, updated_at`,
    [randomUUID(), body.title ?? null, body.runId ?? null, body.emailId ?? null, body.actor],
  );
  return toConversation(rows[0]);
}

/** Newest first, which is the order the list is read in. `runId` narrows it to one run's conversations. */
export async function list(db: Queryable, runId: string | null, limit = 50): Promise<ChatConversation[]> {
  const { rows } = await db.query<ConversationRow>(
    `select c.id, c.title, c.run_id, c.email_id, c.created_by, c.created_at, c.updated_at,
            (select count(*) from core.chat_turns t where t.conversation_id = c.id and t.role <> 'tool')::text as turn_count
       from core.chat_conversations c
      where $1::uuid is null or c.run_id = $1::uuid
      order by c.updated_at desc
      limit $2`,
    [runId, limit],
  );
  return rows.map(toConversation);
}

export async function find(db: Queryable, id: string): Promise<ChatConversation | null> {
  const { rows } = await db.query<ConversationRow>(
    `select c.id, c.title, c.run_id, c.email_id, c.created_by, c.created_at, c.updated_at,
            (select count(*) from core.chat_turns t where t.conversation_id = c.id and t.role <> 'tool')::text as turn_count
       from core.chat_conversations c where c.id = $1::uuid`,
    [id],
  );
  return rows[0] ? toConversation(rows[0]) : null;
}


/**
 * Names an untitled conversation, once.
 *
 * A conversation people can find again is worth more than one they have to
 * name. The label is `agents/chat/title.ts`'s to write, and this only stores
 * it: the rule for what makes a readable label is a pure one and belongs
 * where it can be read and tested, not inside a SQL call.
 */
export async function titleIfUnnamed(db: Queryable, conversationId: string, title: string): Promise<void> {
  await db.query("update core.chat_conversations set title = $2::text where id = $1::uuid and title is null", [
    conversationId,
    title,
  ]);
}

export async function remove(db: Queryable, id: string): Promise<boolean> {
  const { rowCount } = await db.query("delete from core.chat_conversations where id = $1::uuid", [id]);
  return (rowCount ?? 0) > 0;
}
