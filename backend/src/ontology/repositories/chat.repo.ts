import { randomUUID } from "node:crypto";

import type {
  ChatConversation,
  ChatGraph,
  ChatToolCall,
  ChatTurn,
  NewConversation,
  ProposedAction,
} from "../../contracts";
import type { Queryable } from "../../db";

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

interface TurnRow {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_name: string | null;
  tool_args: unknown;
  tool_result: unknown;
  duration_ms: number | null;
  sql_used: string[];
  created_at: Date;
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

/**
 * What an assistant turn carries besides its prose. Stored under one jsonb
 * column rather than three, because they are written together, read together
 * and never queried apart.
 */
interface AssistantExtras {
  toolCalls: ChatToolCall[];
  graph: ChatGraph | null;
  proposal: ProposedAction | null;
}

function extrasOf(row: TurnRow): AssistantExtras {
  const held = row.tool_result as Partial<AssistantExtras> | null;
  return { toolCalls: held?.toolCalls ?? [], graph: held?.graph ?? null, proposal: held?.proposal ?? null };
}

function toTurn(row: TurnRow): ChatTurn {
  const extras = row.role === "assistant" ? extrasOf(row) : { toolCalls: [], graph: null, proposal: null };
  return {
    id: Number(row.id),
    role: row.role,
    content: row.content,
    toolCalls: extras.toolCalls,
    sqlUsed: row.sql_used,
    graph: extras.graph,
    proposal: extras.proposal,
    createdAt: row.created_at.toISOString(),
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

/** Oldest first, as a conversation reads. Tool turns are left out: they live on the assistant turn that made them. */
export async function turns(db: Queryable, conversationId: string, limit = 200): Promise<ChatTurn[]> {
  const { rows } = await db.query<TurnRow>(
    `select id, role, content, tool_name, tool_args, tool_result, duration_ms, sql_used, created_at
       from core.chat_turns
      where conversation_id = $1::uuid and role <> 'tool'
      order by id asc
      limit $2`,
    [conversationId, limit],
  );
  return rows.map(toTurn);
}

export async function addUserTurn(db: Queryable, conversationId: string, content: string): Promise<ChatTurn> {
  const { rows } = await db.query<TurnRow>(
    `insert into core.chat_turns (conversation_id, role, content) values ($1::uuid, 'user', $2::text)
     returning id, role, content, tool_name, tool_args, tool_result, duration_ms, sql_used, created_at`,
    [conversationId, content],
  );
  return toTurn(rows[0]);
}

export interface NewAssistantTurn {
  answer: string;
  sqlUsed: string[];
  toolCalls: ChatToolCall[];
  graph: ChatGraph | null;
  proposal: ProposedAction | null;
}

export async function addAssistantTurn(
  db: Queryable,
  conversationId: string,
  turn: NewAssistantTurn,
): Promise<ChatTurn> {
  const extras: AssistantExtras = { toolCalls: turn.toolCalls, graph: turn.graph, proposal: turn.proposal };
  const { rows } = await db.query<TurnRow>(
    `insert into core.chat_turns (conversation_id, role, content, sql_used, tool_result)
     values ($1::uuid, 'assistant', $2::text, $3::text[], $4::jsonb)
     returning id, role, content, tool_name, tool_args, tool_result, duration_ms, sql_used, created_at`,
    [conversationId, turn.answer, turn.sqlUsed, JSON.stringify(extras)],
  );
  await db.query("update core.chat_conversations set updated_at = now() where id = $1::uuid", [conversationId]);
  return toTurn(rows[0]);
}

/**
 * Names an untitled conversation after its first question.
 *
 * A conversation people can find again is worth more than one they have to
 * name, and the first question is what they will remember it by.
 */
export async function titleIfUnnamed(db: Queryable, conversationId: string, question: string): Promise<void> {
  const title = question.length > 70 ? `${question.slice(0, 69)}…` : question;
  await db.query("update core.chat_conversations set title = $2::text where id = $1::uuid and title is null", [
    conversationId,
    title,
  ]);
}

export async function remove(db: Queryable, id: string): Promise<boolean> {
  const { rowCount } = await db.query("delete from core.chat_conversations where id = $1::uuid", [id]);
  return (rowCount ?? 0) > 0;
}
