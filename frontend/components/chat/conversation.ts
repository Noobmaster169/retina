"use client";

import { ChatConversation } from "@/lib/api/chat-thread-schemas";

/**
 * Opening a conversation, and reading why the backend would not.
 *
 * Split from `use-chat.ts`, which is the asking. A caller with no conversation
 * yet opens one on its first question rather than on mount, so looking at an
 * email and saying nothing leaves nothing behind.
 */

export interface NewConversationBody {
  actor: string;
  runId?: string;
  emailId?: string;
  title?: string;
}

/**
 * The message a refused response carries, or one naming its status.
 *
 * Errors come back as a message rather than a throw because the page renders
 * them beside the question that caused them: a conversation somebody is in the
 * middle of must not be lost to one bad request.
 */
export async function refusal(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const message = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
  return typeof message === "string" ? message : `The answer failed with ${response.status}.`;
}

export async function openConversation(
  body: NewConversationBody,
): Promise<{ ok: true; conversation: ChatConversation } | { ok: false; message: string }> {
  const response = await fetch("/api/chat/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { ok: false, message: await refusal(response) };
  return { ok: true, conversation: ChatConversation.parse(await response.json()) };
}
