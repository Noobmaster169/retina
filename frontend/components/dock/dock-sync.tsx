"use client";

import { useEffect } from "react";

import { useDock } from "./dock-state";

/** The Ask Retina page says which conversation it has open, so the dock is in the same one when the person leaves. */
export function DockSync({ conversationId }: { conversationId: string | null }) {
  const { conversationId: held, setConversationId } = useDock();
  useEffect(() => {
    if (conversationId && conversationId !== held) setConversationId(conversationId);
  }, [conversationId, held, setConversationId]);
  return null;
}
