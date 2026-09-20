import { z } from "zod";

import type { Queryable } from "../../db";

/**
 * What a conversation keeps between turns besides its turns.
 *
 * Split from chat.repo.ts, which holds the conversations and turns themselves.
 * Everything here is rebuildable: losing it costs a recomputation, never an
 * answer.
 */

export const HeldOrientation = z.object({
  text: z.string(),
  /** The derived-data watermark the text was read at. */
  watermark: z.string(),
  /** The run it was computed for, so a conversation re-scoped to another run does not reuse it. */
  runId: z.string().nullable(),
});
export type HeldOrientation = z.infer<typeof HeldOrientation>;

export async function orientationOf(db: Queryable, conversationId: string): Promise<HeldOrientation | null> {
  const { rows } = await db.query<{ orientation: unknown }>(
    "select orientation from core.chat_conversations where id = $1::uuid",
    [conversationId],
  );
  // A shape from an older build is treated as absent and recomputed, not as an error.
  const parsed = HeldOrientation.safeParse(rows[0]?.orientation);
  return parsed.success ? parsed.data : null;
}

/**
 * The skills this conversation has already had put in front of it on purpose:
 * loaded by the agent or picked by the person. They stay for the conversation,
 * so a follow-up does not spend a step asking for the same one again. A skill
 * the harness injected on an event is not sticky: the event may not recur.
 */
export async function stickySkills(db: Queryable, conversationId: string): Promise<string[]> {
  const { rows } = await db.query<{ name: string }>(
    `select distinct used->>'name' as name
       from core.chat_turns t,
            jsonb_array_elements(coalesce(t.tool_result->'skillsUsed', '[]'::jsonb)) as used
      where t.conversation_id = $1::uuid and t.role = 'assistant' and used->>'how' in ('loaded', 'picked')
      order by 1`,
    [conversationId],
  );
  return rows.map((row) => row.name);
}

export async function setOrientation(db: Queryable, conversationId: string, held: HeldOrientation): Promise<void> {
  await db.query("update core.chat_conversations set orientation = $2::jsonb where id = $1::uuid", [
    conversationId,
    JSON.stringify(held),
  ]);
}
