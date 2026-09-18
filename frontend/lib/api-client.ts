/**
 * The frontend's only door to the backend. Server-side only: the shared
 * secret must never reach the browser, so nothing under components/ may
 * import this — pages, route handlers and server actions do.
 *
 * The types below are the API contract; the backend declares the same shapes
 * in backend/src/llm.ts and backend/src/emails.ts. Keep them in step.
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

export interface Email {
  email_id: string;
  from: string;
  subject: string;
  body: string;
  /** Paths as the email server stores them: "attachments/email_004_SI.txt". */
  attachments: string[];
}

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  attachmentCount: number;
}

export interface EmailListQuery {
  q?: string;
  filter?: "attachments";
  page?: number;
  limit?: number;
}

export interface EmailPage {
  emails: EmailSummary[];
  total: number;
  page: number;
  limit: number;
  counts: { all: number; attachments: number };
}

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
 * declared as `maxDuration` in app/chat/page.tsx.
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

export async function listEmails(query: EmailListQuery = {}): Promise<EmailPage> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.filter) params.set("filter", query.filter);
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.size ? `?${params}` : "";
  const response = await request(`/emails${qs}`);
  if (!response.ok) throw new Error(`Backend GET /emails → ${response.status}`);
  return (await response.json()) as EmailPage;
}

/** Null when the id is unknown; throws when the backend is unreachable. */
export async function getEmail(id: string): Promise<Email | null> {
  const response = await request(`/emails/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Backend GET /emails/${id} → ${response.status}`);
  return (await response.json()) as Email;
}

/** The backend's response as is, for streaming through to the browser. */
export async function fetchAttachment(name: string): Promise<Response> {
  return request(`/emails/attachments/${encodeURIComponent(name)}`, { timeoutMs: 60_000 });
}
