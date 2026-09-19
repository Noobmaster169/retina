import { z } from "zod";

import { get, parseAs, refusalMessage, request } from "./transport";

/** Mirrors backend/src/llm.ts; change both or neither. */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * The backend also accepts `outputSchema` for provider-enforced structured
 * output. It is absent here on purpose: the chat panel asks for prose, and a
 * field no caller sets is surface that can only drift.
 */
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  system?: string;
  maxTokens?: number;
}

const ModelInfo = z.object({ id: z.string(), provider: z.string(), model: z.string() });
export type ModelInfo = z.infer<typeof ModelInfo>;

const ModelList = z.object({ models: z.array(ModelInfo) });

const ChatResult = z.object({
  text: z.string(),
  model: z.string().nullable(),
  stopReason: z.string().nullable(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  costUsd: z.number().nullable(),
});
export type ChatResult = z.infer<typeof ChatResult>;

export type ChatOutcome = { ok: true; result: ChatResult } | { ok: false; message: string };

export async function listModels(): Promise<ModelInfo[]> {
  return (await get(ModelList, "/ai/models")).models;
}

/**
 * Errors come back as a message rather than a throw, because the page
 * renders them inline. The timeout sits just under the Vercel function limit
 * declared as `maxDuration` in app/chat/page.tsx.
 */
export async function chat(req: ChatRequest): Promise<ChatOutcome> {
  const response = await request("/ai/chat", { method: "POST", body: JSON.stringify(req), timeoutMs: 290_000 });
  if (!response.ok) return { ok: false, message: await refusalMessage(response) };
  return { ok: true, result: await parseAs(ChatResult, response, "POST /ai/chat") };
}
