import type { ChatToolCall, ChatTurn } from "../../contracts";
import type { Queryable } from "../../db";
import { toTurn, type TurnRow } from "./chat.turns";

/**
 * A turn's steps while the turn is still running.
 *
 * The loop writes one `role = 'tool'` row per finished call, and the page polls
 * for rows newer than the question it asked. That is the whole of "you see each
 * step": no queue and no stream, and the POST still holds until the answer, so
 * nothing is fire-and-forget.
 *
 * Kept apart from chat.turns.ts because these are the only two reads and writes
 * that see tool rows at all. Every other one leaves them out, and mixing the two
 * kinds in one module is how a thread ends up accidentally showing its own
 * working twice.
 */

const COLUMNS = "id, role, content, tool_name, tool_args, tool_result, duration_ms, sql_used, created_at";

/** What a tool row's single call looks like before the row's own fields are laid over it. */
const BARE_CALL: ChatToolCall = {
  tool: "run_sql",
  args: {},
  thought: "",
  ok: true,
  preview: "",
  sql: null,
  result: null,
  durationMs: 0,
  recipe: null,
};

export interface FinishedStep {
  tool: ChatToolCall["tool"];
  args: Record<string, unknown>;
  thought: string;
  ok: boolean;
  preview: string;
  durationMs: number;
}

/**
 * One finished call, written the moment it finishes.
 *
 * `turns` and `recentTurns` both leave these rows out and `turn_count` does not
 * count them, so the thread a reader opens afterwards is exactly what it was
 * before this existed and the model is never handed its own steps twice.
 * `inReplyTo` is the question these steps serve, which is what lets the page
 * tell this turn's steps from the last turn's and drop them when the answer
 * lands.
 */
export async function addToolTurn(
  db: Queryable,
  conversationId: string,
  inReplyTo: number,
  call: FinishedStep,
): Promise<ChatTurn> {
  const { rows } = await db.query<TurnRow>(
    `insert into core.chat_turns (conversation_id, role, content, tool_name, tool_args, duration_ms, in_reply_to)
     values ($1::uuid, 'tool', $2::text, $3::text, $4::jsonb, $5::int, $6::bigint)
     returning ${COLUMNS}`,
    [conversationId, call.thought, call.tool, JSON.stringify(call.args), call.durationMs, inReplyTo],
  );
  // The preview belongs on the wire but not in `content`, which holds the
  // agent's own sentence on why it made the call.
  return { ...toTurn(rows[0]), toolCalls: [{ ...BARE_CALL, ...call }] };
}

/**
 * Every turn of a conversation newer than `after`, tool rows included.
 *
 * The one read that does not filter them out. It is what the page polls while
 * its own POST is still in flight.
 */
export async function turnsAfter(db: Queryable, conversationId: string, after: number, limit = 50): Promise<ChatTurn[]> {
  const { rows } = await db.query<TurnRow>(
    `select ${COLUMNS}
       from core.chat_turns
      where conversation_id = $1::uuid and id > $2::bigint
      order by id asc
      limit $3`,
    [conversationId, after, limit],
  );
  return rows.map((row) => {
    if (row.role !== "tool") return toTurn(row);
    return {
      ...toTurn(row),
      toolCalls: [
        {
          ...BARE_CALL,
          tool: (row.tool_name ?? "run_sql") as ChatToolCall["tool"],
          args: (row.tool_args ?? {}) as Record<string, unknown>,
          thought: row.content,
          durationMs: row.duration_ms ?? 0,
        },
      ],
    };
  });
}
