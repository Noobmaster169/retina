/**
 * The frontend's only door to the backend. Server-side only: the shared
 * secret must never reach the browser, so nothing under components/ may
 * import this — pages and server actions do.
 *
 * The types below are the API contract; the backend declares the same shapes
 * in backend/src/llm.ts. Keep them in step.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  system?: string;
  maxTokens?: number;
}

export interface ChatResult {
  text: string;
  model: string | null;
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number | null;
}

export interface ModelInfo {
  id: string;
  provider: string;
  model: string;
}

export type ChatOutcome = { ok: true; result: ChatResult } | { ok: false; message: string };

function config(): { baseUrl: string; secret: string } {
  const baseUrl = process.env.BACKEND_URL;
  const secret = process.env.API_SHARED_SECRET;
  if (!baseUrl) throw new Error("BACKEND_URL is not set");
  if (!secret) throw new Error("API_SHARED_SECRET is not set");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), secret };
}

async function request(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { baseUrl, secret } = config();
  const { timeoutMs = 15_000, ...rest } = init;
  return fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
}

export async function listModels(): Promise<ModelInfo[]> {
  const response = await request("/ai/models");
  if (!response.ok) throw new Error(`Backend GET /ai/models → ${response.status}`);
  const { models } = (await response.json()) as { models: ModelInfo[] };
  return models;
}

/**
 * Errors come back as a message rather than a throw, because the page
 * renders them inline. The timeout sits just under the Vercel function limit
 * declared as `maxDuration` in app/page.tsx.
 */
export async function chat(req: ChatRequest): Promise<ChatOutcome> {
  const response = await request("/ai/chat", {
    method: "POST",
    body: JSON.stringify(req),
    timeoutMs: 290_000,
  });
  const body = (await response.json().catch(() => ({}))) as Partial<ChatResult> & { error?: string };
  if (!response.ok) return { ok: false, message: body.error ?? `Backend returned ${response.status}` };
  return { ok: true, result: body as ChatResult };
}
