import type { z } from "zod";

/**
 * How the frontend reaches the backend, and nothing about what it asks for.
 * Server-side only: the shared secret must never reach the browser, so nothing
 * under components/ may import this — pages, route handlers and server actions do.
 */

function config(): { baseUrl: string; secret: string } {
  const baseUrl = process.env.BACKEND_URL;
  const secret = process.env.API_SHARED_SECRET;
  if (!baseUrl) throw new Error("BACKEND_URL is not set");
  if (!secret) throw new Error("API_SHARED_SECRET is not set");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), secret };
}

export async function request(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
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

/**
 * The contract check every response goes through. The types in this folder are
 * mirrored from the backend by hand, so without a parse here a renamed field
 * type-checks on both sides and fails in the browser as `undefined.toFixed()`.
 * A drift now surfaces where it happened, naming the field.
 */
export async function parseAs<T>(schema: z.ZodType<T>, response: Response, what: string): Promise<T> {
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    throw new Error(`${what} answered outside the contract at ${issue?.path.join(".") || "(root)"}: ${issue?.message}`);
  }
  return parsed.data;
}

/** The backend answered, and not with success. `status` says whose fault it was. */
export class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

/** A read that either parses or throws, for the GETs whose failure is a page-level error. */
export async function get<T>(schema: z.ZodType<T>, path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const response = await request(path, init);
  if (!response.ok) throw new BackendError(`Backend GET ${path} → ${response.status}`, response.status);
  return parseAs(schema, response, `GET ${path}`);
}

/** The `{ error }` body the api sends with every refusal. */
export async function refusalMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const message = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
  return typeof message === "string" ? message : `Backend returned ${response.status}`;
}
