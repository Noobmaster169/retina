import type { ReviewReason } from "./runs-schemas";
import { ReviewActionResult, type ReviewActionInput, ReviewQueue, ReviewStats } from "./review-schemas";
import { ReviewCaseView } from "./trace-schemas";
import { get, parseAs, refusalMessage, request } from "./transport";

export * from "./review-schemas";

/**
 * The review inbox. Server-side only, like every client in this folder: the
 * shared secret must never reach the browser.
 *
 * A refusal comes back as a message rather than a throw, because the page
 * shows it: the api says why a case is not in a state for an action, and
 * inventing a second wording here would make two products.
 */

export type ReviewOutcome = { ok: true; result: ReviewActionResult } | { ok: false; status: number; message: string };

export interface ReviewQuery {
  runId?: string;
  status?: "open" | "resolved" | "all";
  reason?: ReviewReason;
  kind?: "review" | "failure";
  page?: number;
  pageSize?: number;
}

function query(input: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const string = params.toString();
  return string ? `?${string}` : "";
}

export async function listReviewCases(input: ReviewQuery = {}): Promise<ReviewQueue> {
  return get(ReviewQueue, `/review${query({ ...input })}`);
}

export async function getReviewStats(runId?: string): Promise<ReviewStats> {
  return get(ReviewStats, `/review/stats${query({ runId })}`);
}

/** Null when there is no such case. */
export async function getReviewCase(id: string): Promise<ReviewCaseView | null> {
  const path = `/review/${encodeURIComponent(id)}`;
  const response = await request(path);
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error(`Backend GET ${path} → ${response.status}`);
  return parseAs(ReviewCaseView, response, `GET ${path}`);
}

async function outcome(response: Response, what: string): Promise<ReviewOutcome> {
  if (!response.ok) return { ok: false, status: response.status, message: await refusalMessage(response) };
  return { ok: true, result: await parseAs(ReviewActionResult, response, what) };
}

export async function actOnCase(id: string, body: ReviewActionInput): Promise<ReviewOutcome> {
  const path = `/review/${encodeURIComponent(id)}/actions`;
  return outcome(await request(path, { method: "POST", body: JSON.stringify(body) }), `POST ${path}`);
}

/**
 * The file goes up as multipart: the browser's own FormData is relayed whole
 * rather than read into memory here. A 20 MB file over a tunnel is slower than
 * a read, so this one call gets a minute.
 */
export async function uploadToCase(id: string, form: FormData): Promise<ReviewOutcome> {
  const path = `/review/${encodeURIComponent(id)}/upload`;
  return outcome(await request(path, { method: "POST", body: form, timeoutMs: 60_000 }), `POST ${path}`);
}
