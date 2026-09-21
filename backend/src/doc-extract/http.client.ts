import { z } from "zod";

import { DocExtractUnavailableError, isTransient, RetryableError, TerminalError, UpstreamError } from "../lib/errors";
import { childLogger } from "../lib/logger";
import {
  type DocExtractClient,
  ExtractResponse,
  type ExtractRequest,
  RenderResponse,
  type RenderRequest,
} from "./doc-extract-client";

const log = childLogger({ module: "doc-extract" });

/** A page of OCR at 220 dpi is seconds; a large scan is tens of them. */
export const EXTRACT_TIMEOUT_MS = 60_000;
export const RENDER_TIMEOUT_MS = 120_000;

/** The service's error envelope, which states its own verdict on a retry, as the proxy does. */
const ErrorBody = z.object({ error: z.string().optional(), retryable: z.boolean().optional() });

async function readError(response: Response): Promise<{ message: string; retryable: boolean | null }> {
  const parsed = ErrorBody.safeParse(await response.json().catch(() => null));
  return {
    message: parsed.success && parsed.data.error ? parsed.data.error : `HTTP ${response.status}`,
    retryable: parsed.success ? (parsed.data.retryable ?? null) : null,
  };
}

/**
 * The real client. Unreachable, or a failure the service itself calls
 * retryable (its object store was down), is an outage: the queue pauses.
 * A timeout spends an attempt. Anything the service calls permanent, a 404 for
 * a key that is not there, fails the email now.
 */
export function httpDocExtractClient(baseUrl: string, fetchImpl: typeof fetch = fetch): DocExtractClient {
  const base = baseUrl.replace(/\/+$/, "");

  async function post<T>(path: string, body: unknown, schema: z.ZodType<T>, timeoutMs: number): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new RetryableError(`doc-extract gave no answer to ${path} within ${timeoutMs / 1000} s`, { cause: error });
      }
      throw new DocExtractUnavailableError(`doc-extract unreachable at ${base}`, { cause: error });
    }
    if (!response.ok) {
      const { message, retryable } = await readError(response);
      const failure = new UpstreamError(response.status, `doc-extract returned ${response.status}: ${message}`, { retryable });
      log.warn({ path, status: response.status, retryable, err: message }, "doc-extract failed");
      if (isTransient(failure)) throw new DocExtractUnavailableError(failure.message, { cause: failure });
      throw new TerminalError(failure.message, { cause: failure });
    }
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new TerminalError(`doc-extract answered ${path} with an unexpected shape`, { cause: parsed.error });
    return parsed.data;
  }

  return {
    extract(request: ExtractRequest) {
      const body = {
        key: request.key,
        filename: request.filename,
        content_type: request.contentType ?? null,
        out_prefix: request.outPrefix ?? null,
      };
      return post("/extract", body, ExtractResponse, EXTRACT_TIMEOUT_MS);
    },
    render(request: RenderRequest) {
      const body = { key: request.key, filename: request.filename, out_prefix: request.outPrefix, dpi: request.dpi ?? null };
      return post("/render", body, RenderResponse, RENDER_TIMEOUT_MS);
    },
  };
}

/** For /health: resolves when the service answers its health route. */
export async function pingDocExtract(baseUrl: string, timeoutMs: number): Promise<void> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/healthz`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`doc-extract /healthz returned ${response.status}`);
}
