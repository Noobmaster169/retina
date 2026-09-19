/**
 * The frontend's only door to the backend. Server-side only: the shared
 * secret must never reach the browser, so nothing under components/ may
 * import this — pages, route handlers and server actions do.
 *
 * The types below are the API contract; the backend declares the same shapes
 * in backend/src/llm.ts, backend/src/emails.ts and backend/src/contracts.ts. Keep
 * them in step.
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
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      // The backend is behind a free ngrok tunnel, which answers an HTML
      // interstitial instead of the API when it thinks a browser is calling.
      // This header turns that off; without it a JSON parse fails with markup.
      "ngrok-skip-browser-warning": "1",
    },
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

// Runs. Mirrors backend/src/contracts.ts; change both or neither.

export type RunStatus = "created" | "running" | "paused" | "completed" | "cancelled" | "failed";
export type Stage = "ingested" | "classifying" | "classified" | "comparing" | "review" | "done" | "failed";
export type RunAction = "pause" | "resume" | "cancel";

export interface QueueCounts {
  waiting: number;
  active: number;
  failed: number;
}

export interface RunSummary {
  id: string;
  /** `completed` means ingestion finished. Processing is finished when done + failed = totalEmails. */
  status: RunStatus;
  ratePerSecond: number;
  totalEmails: number | null;
  stageCounts: Record<Stage, number>;
  /** Null when the backend cannot reach its queues. Everything else is still served. */
  queues: { classify: QueueCounts; compare: QueueCounts } | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  llm: LlmUsage;
  /** The newest submission to the scorer. */
  lastSubmission: LastSubmission | null;
}

export interface LlmUsage {
  calls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  /** What the API would have charged. On the subscription rail nothing is billed. */
  costUsd: number;
}

export interface HeadlineScores {
  stage1MacroF1: number;
  stage3DefectF1: number;
  endToEndRate: number;
  escalationRecall: number;
  escalationPrecision: number;
}

export interface LastSubmission {
  id: string;
  finalScore: number | null;
  nEmails: number;
  forced: boolean;
  createdAt: string;
  scores: HeadlineScores | null;
}

// The organisers' enums, value for value (emails/data_v2/README.md, scoring.py).
// Mirrors backend/src/contracts.scoring.ts. Never add a value.
export type Category = "BL_COMPARISON" | "SI_REQUEST" | "INVOICE_QUERY" | "GENERAL" | "SPAM";
export type ComparisonStatus = "OK" | "MISMATCH" | "NEEDS_REVIEW";
export type ReviewReason = "wrong_doc_type" | "missing_attachment" | "unreadable" | "missing_value";
export type ComparisonField =
  | "shipper"
  | "consignee"
  | "notify_party"
  | "port_of_loading"
  | "port_of_discharge"
  | "container_count"
  | "gross_weight_kg";

/** The scorer's JSON, snake_case as the organisers write it. */
export interface Scoreboard {
  stage1: {
    accuracy: number;
    macro_f1: number;
    rule_pct: number | null;
    per: Record<string, { tp: number; fp: number; fn: number }>;
    confusion: Record<string, Record<string, number>>;
  };
  stage3: {
    defect_precision: number;
    defect_recall: number;
    defect_f1: number;
    field_f1: number;
    exact_match_rate: number;
    doc_total: number;
  };
  reliability: {
    escalation_recall: number;
    escalation_precision: number;
    escalation_f1: number;
    gold_review: number;
    pred_review: number;
    per_reason: Record<string, { total: number; caught: number }>;
  };
  end_to_end: { success: number; total: number; rate: number };
  weights: { stage1: number; stage3: number; end_to_end: number };
  final_score: number;
  n_emails: number;
}

export type SubmitOutcome =
  | { ok: true; finalScore: number; scoreboard: Scoreboard }
  /** On a 409 `forcible` says whether `force` would get past this refusal: a run still ingesting or
   * holding unfinished emails can be forced, one whose earlier submission is still being scored cannot. */
  | { ok: false; status: number; message: string; incomplete?: string[]; forcible?: boolean };

/** Dev only: a run scored by the backend against the answer key it holds locally. */
export interface EvalReport {
  full: Scoreboard;
  holdout: Scoreboard;
  run: Scoreboard;
  wrong: { stage1: string[]; stage3: string[]; e2e: string[] };
}

export interface CreateRunInput {
  /** 0 is a burst: everything is enqueued at once. */
  ratePerSecond?: number;
  limit?: number;
  emailIds?: string[];
}

export interface RunEmailItem {
  emailId: string;
  from: string;
  subject: string;
  stage: Stage;
  attachmentCount: number;
  outcome: string | null;
}

export interface RunEmailsQuery {
  stage?: Stage;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface RunEmailsPage {
  emails: RunEmailItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** A refusal (400, 404, 409, 503) comes back as a message, because the page shows it inline. */
export type RunOutcome = { ok: true; run: RunSummary } | { ok: false; status: number; message: string };

async function runOutcome(response: Response): Promise<RunOutcome> {
  const body = (await response.json().catch(() => ({}))) as Partial<RunSummary> & { error?: string };
  if (!response.ok) {
    return { ok: false, status: response.status, message: body.error ?? `Backend returned ${response.status}` };
  }
  return { ok: true, run: body as RunSummary };
}

export async function listRuns(): Promise<RunSummary[]> {
  const response = await request("/runs");
  if (!response.ok) throw new Error(`Backend GET /runs → ${response.status}`);
  const { runs } = (await response.json()) as { runs: RunSummary[] };
  return runs;
}

/** Null when the id is unknown; throws when the backend is unreachable. */
export async function getRun(id: string): Promise<RunSummary | null> {
  const response = await request(`/runs/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Backend GET /runs/${id} → ${response.status}`);
  return (await response.json()) as RunSummary;
}

export async function createRun(input: CreateRunInput): Promise<RunOutcome> {
  return runOutcome(await request("/runs", { method: "POST", body: JSON.stringify(input) }));
}

async function controlRun(id: string, action: RunAction): Promise<RunOutcome> {
  return runOutcome(await request(`/runs/${encodeURIComponent(id)}/${action}`, { method: "POST" }));
}

export async function pauseRun(id: string): Promise<RunOutcome> {
  return controlRun(id, "pause");
}

export async function resumeRun(id: string): Promise<RunOutcome> {
  return controlRun(id, "resume");
}

export async function cancelRun(id: string): Promise<RunOutcome> {
  return controlRun(id, "cancel");
}

export async function submitRun(id: string, force: boolean): Promise<SubmitOutcome> {
  const response = await request(`/runs/${encodeURIComponent(id)}/submit?force=${force}`, { method: "POST", timeoutMs: 60_000 });
  const body = (await response.json().catch(() => ({}))) as {
    finalScore?: number;
    scoreboard?: Scoreboard;
    error?: string;
    incomplete?: string[];
    forcible?: boolean;
  };
  if (!response.ok || body.finalScore === undefined || !body.scoreboard) {
    return {
      ok: false,
      status: response.status,
      message: body.error ?? `Backend returned ${response.status}`,
      incomplete: body.incomplete,
      forcible: body.forcible,
    };
  }
  return { ok: true, finalScore: body.finalScore, scoreboard: body.scoreboard };
}

/** Null where the backend has no answer key, which is everywhere but a dev machine. */
export async function getEvalReport(id: string): Promise<EvalReport | null> {
  const response = await request(`/eval/runs/${encodeURIComponent(id)}`, { timeoutMs: 30_000 });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Backend GET /eval/runs/${id} → ${response.status}`);
  return (await response.json()) as EvalReport;
}

export async function listRunEmails(id: string, query: RunEmailsQuery = {}): Promise<RunEmailsPage> {
  const params = new URLSearchParams();
  if (query.stage) params.set("stage", query.stage);
  if (query.q) params.set("q", query.q);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const qs = params.size ? `?${params}` : "";
  const response = await request(`/runs/${encodeURIComponent(id)}/emails${qs}`);
  if (!response.ok) throw new Error(`Backend GET /runs/${id}/emails → ${response.status}`);
  return (await response.json()) as RunEmailsPage;
}
