"use client";

import { use, useEffect } from "react";

import { useChatStore } from "@/components/chat/chat-store";
import type { ChatThread } from "@/lib/api/chat-thread-schemas";

/**
 * Hands the server's copy of the thread to the store when it arrives.
 *
 * Suspends on its own, under a boundary of its own, so the page it belongs to
 * never waits for it. Renders nothing: the thread is drawn from the store,
 * which this only adds to.
 */
export function Seed({ id, thread }: { id: string | null; thread: Promise<ChatThread | null> }) {
  const loaded = use(thread);
  const { seed } = useChatStore();
  const turns = loaded?.turns;
  useEffect(() => {
    if (id && turns && turns.length > 0) seed(id, turns);
  }, [id, turns, seed]);
  return null;
}
