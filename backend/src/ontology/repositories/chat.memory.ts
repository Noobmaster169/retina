import type { ClarifyingQuestion, GroundedThing } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * What earlier turns of one conversation established, read back for the next.
 *
 * Out of `core.chat_turns` and no new table: every field is already stored on
 * the assistant turn that produced it, under the same jsonb the tool calls and
 * the graph live in.
 */

export interface ConversationMemory {
  /** Most recently grounded first, deduplicated by canonical. */
  things: GroundedThing[];
  /** The runs earlier turns actually ran a recipe against. */
  runsUsed: string[];
  /** The last turn asked this and nothing has answered it yet. */
  openQuestion: ClarifyingQuestion | null;
}

interface ExtrasRow {
  id: string;
  role: "user" | "assistant" | "tool";
  tool_result: {
    grounded?: GroundedThing[];
    clarify?: ClarifyingQuestion | null;
    toolCalls?: { recipe?: { params?: Record<string, unknown> } | null }[];
  } | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The run ids a turn's recipes were actually bound to. Read off the normalised params, never guessed from the prose. */
function runsIn(row: ExtrasRow): string[] {
  return (row.tool_result?.toolCalls ?? []).flatMap((call) => {
    const value = call.recipe?.params?.run_id;
    return typeof value === "string" && UUID.test(value) ? [value] : [];
  });
}

export async function memoryOf(db: Queryable, conversationId: string, turns = 6): Promise<ConversationMemory> {
  const { rows } = await db.query<ExtrasRow>(
    `select id, role, tool_result from (
       select id, role, tool_result
         from core.chat_turns
        where conversation_id = $1::uuid and role = 'assistant'
        order by id desc
        limit $2
     ) newest order by id desc`,
    [conversationId, turns],
  );

  const things: GroundedThing[] = [];
  const seen = new Set<string>();
  const runs = new Set<string>();
  for (const row of rows) {
    for (const thing of row.tool_result?.grounded ?? []) {
      if (seen.has(thing.canonical)) continue;
      seen.add(thing.canonical);
      things.push(thing);
    }
    for (const run of runsIn(row)) runs.add(run);
  }

  // Only the most recent turn's question is open: an earlier one was either
  // answered or overtaken, and offering both would ask the person twice.
  const last = rows[0]?.tool_result?.clarify ?? null;
  return { things, runsUsed: [...runs], openQuestion: last };
}
