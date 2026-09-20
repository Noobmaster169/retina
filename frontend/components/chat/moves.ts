import type { ChatNextMove } from "@/lib/api/chat-agent-schemas";
import type { ChatTurn } from "@/lib/api/chat-agent-schemas";

/**
 * How an answer's tail is arranged: which chips come first, and whether the
 * outcome is worth a line of its own.
 *
 * Pure, and split from the components that draw it, because this is the part
 * with a right answer. Whether an alternative outranks a follow-up is a
 * decision; the markup around it is not.
 *
 * Nothing here decides whether a move is real. That happens in the backend's
 * `next-moves.ts` before the turn is stored, against what the tools returned,
 * so a chip that reaches this file was already checked.
 */

/** A thing that is there beats another question about what is not. */
export function orderMoves(moves: ChatNextMove[]): ChatNextMove[] {
  return [...moves].sort((a, b) => Number(a.kind === "follow_up") - Number(b.kind === "follow_up"));
}

/**
 * The opening words of the outcome line, or null where the answer speaks for
 * itself.
 *
 * Only `none_found` and `partial` get one, and only with somewhere to name:
 * "Looked in:" with nothing after it says less than nothing. The backend drops
 * the claim when its evidence is missing, so this is the second guard, not the
 * first.
 */
export function outcomeLead(turn: Pick<ChatTurn, "outcome" | "checked">): string | null {
  if (turn.checked.length === 0) return null;
  if (turn.outcome === "none_found") return "Nothing found.";
  if (turn.outcome === "partial") return "Part of it.";
  return null;
}
