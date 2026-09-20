import type {
  ChatGraph,
  ChatNextMove,
  ChatOutcome,
  ChatSkillUse,
  ChatToolCall,
  ChatTurn,
  ClarifyingQuestion,
  GroundedThing,
  ProposedAction,
} from "../../contracts";
import type { Queryable } from "../../db";

/**
 * The turns of a conversation. Split from chat.repo.ts, which holds the
 * conversations themselves and re-exports this, so callers still say `chat.turns`.
 */

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

/**
 * What an assistant turn carries besides its prose. Stored under one jsonb
 * column rather than three, because they are written together, read together
 * and never queried apart.
 */
interface AssistantExtras {
  toolCalls: ChatToolCall[];
  graph: ChatGraph | null;
  proposal: ProposedAction | null;
  reading: string;
  skillsUsed: ChatSkillUse[];
  adhoc: boolean;
  outcome: ChatOutcome;
  checked: string[];
  next: ChatNextMove[];
  clarify: ClarifyingQuestion | null;
  /** CHAT.md's version on the turn that ran, beside the skills'. */
  standingVersion: number;
  /** What this turn grounded, which the turns after it remember by name. Read by chat.memory.ts. */
  grounded: GroundedThing[];
}

const NO_EXTRAS: AssistantExtras = {
  toolCalls: [],
  graph: null,
  proposal: null,
  reading: "",
  skillsUsed: [],
  adhoc: false,
  outcome: "answered",
  checked: [],
  next: [],
  clarify: null,
  standingVersion: 0,
  grounded: [],
};

function extrasOf(row: TurnRow): AssistantExtras {
  const held = row.tool_result as Partial<AssistantExtras> | null;
  // A turn stored before the harness has none of the later fields, and reads as their defaults.
  return { ...NO_EXTRAS, ...Object.fromEntries(Object.entries(held ?? {}).filter(([, value]) => value !== undefined)) };
}

function toTurn(row: TurnRow): ChatTurn {
  const extras = row.role === "assistant" ? extrasOf(row) : NO_EXTRAS;
  return {
    id: Number(row.id),
    role: row.role,
    content: row.content,
    toolCalls: extras.toolCalls,
    sqlUsed: row.sql_used,
    graph: extras.graph,
    proposal: extras.proposal,
    reading: extras.reading,
    skillsUsed: extras.skillsUsed,
    adhoc: extras.adhoc,
    outcome: extras.outcome,
    checked: extras.checked,
    next: extras.next,
    clarify: extras.clarify,
    createdAt: row.created_at.toISOString(),
  };
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

/**
 * The last `limit` turns, oldest first, which is what the model is given back.
 *
 * `turns` takes the first N and is right for drawing a thread from the top.
 * Handing the model that same page was wrong in a way nothing would have shown
 * until a conversation ran past the limit: it would have been given the
 * opening exchanges and none of the recent ones, and answered the question
 * before last.
 */
export async function recentTurns(db: Queryable, conversationId: string, limit: number): Promise<ChatTurn[]> {
  const { rows } = await db.query<TurnRow>(
    `select * from (
       select id, role, content, tool_name, tool_args, tool_result, duration_ms, sql_used, created_at
         from core.chat_turns
        where conversation_id = $1::uuid and role <> 'tool'
        order by id desc
        limit $2
     ) newest order by id asc`,
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
  reading: string;
  skillsUsed: ChatSkillUse[];
  adhoc: boolean;
  outcome: ChatOutcome;
  checked: string[];
  next: ChatNextMove[];
  clarify: ClarifyingQuestion | null;
  standingVersion: number;
  grounded: GroundedThing[];
}

export async function addAssistantTurn(
  db: Queryable,
  conversationId: string,
  turn: NewAssistantTurn,
): Promise<ChatTurn> {
  const { answer: _answer, sqlUsed: _sqlUsed, ...extras } = turn;
  const { rows } = await db.query<TurnRow>(
    `insert into core.chat_turns (conversation_id, role, content, sql_used, tool_result)
     values ($1::uuid, 'assistant', $2::text, $3::text[], $4::jsonb)
     returning id, role, content, tool_name, tool_args, tool_result, duration_ms, sql_used, created_at`,
    [conversationId, turn.answer, turn.sqlUsed, JSON.stringify(extras)],
  );
  await db.query("update core.chat_conversations set updated_at = now() where id = $1::uuid", [conversationId]);
  return toTurn(rows[0]);
}
