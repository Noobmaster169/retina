"use client";

import { useEffect, useState } from "react";

import { ChatTurnsAfter, type ChatTurn } from "@/lib/api/chat-agent-schemas";

/**
 * The steps of the turn in flight, polled while its own POST is still open.
 *
 * It reads rows already written, so it holds nothing open, costs no model call
 * and cannot slow the answer down. A missed poll costs a moment of the steps
 * and nothing else: the answer itself is coming back on the POST.
 *
 * What came back is kept under the turn it came back for, and returned only
 * while that is still the turn being watched. Without that, the first second of
 * every question would show the previous question's steps: the poll has not
 * answered yet, and state from the last turn is all there is to draw.
 */

/** Slower than this and the steps arrive in clumps; faster and it is polling for its own sake. */
const POLL_MS = 1000;

export interface Watched {
  conversationId: string;
  /** The id of the question these steps answer. Everything after it belongs to this turn. */
  after: number;
}

function keyOf(watched: Watched | null): string {
  return watched ? `${watched.conversationId}:${watched.after}` : "";
}

export function useLiveSteps(watched: Watched | null): ChatTurn[] {
  const [seen, setSeen] = useState<{ key: string; steps: ChatTurn[] }>({ key: "", steps: [] });

  useEffect(() => {
    if (!watched) return;
    let live = true;
    const key = keyOf(watched);
    const tick = async () => {
      try {
        const response = await fetch(`/api/chat/${watched.conversationId}/turns?after=${watched.after}`);
        if (!response.ok || !live) return;
        const body = ChatTurnsAfter.parse(await response.json());
        if (live) setSeen({ key, steps: body.turns.filter((turn) => turn.role === "tool") });
      } catch {
        // See above: a missed poll is a moment of the steps, not a failed turn.
      }
    };
    const every = setInterval(() => void tick(), POLL_MS);
    return () => {
      live = false;
      clearInterval(every);
    };
  }, [watched]);

  return seen.key === keyOf(watched) ? seen.steps : [];
}
