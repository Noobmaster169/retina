import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { config } from "./config";
import { LlmTimeoutError, relayStatus, UpstreamError } from "./lib/errors";
import type { ChatRequest } from "./llm-contract";

/**
 * What the blocking and the streaming call share: the proxy's address, the SDK
 * client, the request body and how a failure becomes one of our errors.
 */

/** A long `claude -p` generation can take minutes. Past this an attempt is an LlmTimeoutError. */
export const REQUEST_TIMEOUT_MS = 600_000;
/**
 * The wire requires a cap, so this is a generous one, not a budget: a cap that
 * bites truncates the answer mid-object. `claude -p` has no such setting and
 * ignores it.
 */
const DEFAULT_MAX_TOKENS = 8000;

export function baseUrl(): string {
  return config.LLM_PROXY_URL.replace(/\/+$/, "");
}

export function proxyClient(project: string): Anthropic {
  return new Anthropic({
    baseURL: baseUrl(),
    // Not a credential: the proxy reads this as the project name that spend
    // is attributed and budgeted against, so callers show up separately.
    apiKey: `retina-${project}`,
    // Retries belong to the caller: BullMQ for the pipeline, the user for chat. A
    // silent second try here doubled a hung call to 20 minutes and hid a call from the ledger.
    maxRetries: 0,
    timeout: REQUEST_TIMEOUT_MS,
  });
}

/**
 * A message as the wire carries it: plain text, or text with images beside it.
 *
 * `claude -p` has no image block of its own; the proxy writes each one to a file
 * and lets the session read it. That is the proxy's business, and this side sends
 * an ordinary Anthropic image block either way.
 */
function wireMessage(message: ChatRequest["messages"][number]): Anthropic.MessageParam {
  if (!message.images || message.images.length === 0) return { role: message.role, content: message.content };
  return {
    role: message.role,
    content: [
      ...message.images.map((image) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: image.mediaType as "image/png", data: image.base64 },
      })),
      { type: "text" as const, text: message.content },
    ],
  };
}

/** The request body. `temperature` is never sent: Claude 5 rejects it. */
export function messageParams(req: ChatRequest): Anthropic.MessageCreateParamsNonStreaming {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: req.messages.map(wireMessage),
  };
  if (req.system) params.system = req.system;
  if (req.outputSchema) params.output_config = { format: { type: "json_schema", schema: req.outputSchema } };
  return params;
}

/**
 * The proxy's error envelope. It states `retryable` per error class, which is
 * the only thing that separates an unknown provider from a dead upstream: both
 * are 500. A proxy too old to send it leaves the field absent and the caller
 * falls back to reading the status.
 */
const ProxyErrorBody = z.object({
  error: z.object({ retryable: z.boolean().optional() }).optional(),
});

export function upstreamVerdict(body: unknown): boolean | null {
  const parsed = ProxyErrorBody.safeParse(body);
  return parsed.success ? (parsed.data.error?.retryable ?? null) : null;
}

/** An SDK failure as one of ours, or the error unchanged when it is not the SDK's. */
export function asLlmError(error: unknown): unknown {
  const url = baseUrl();
  // Before the connection and API checks: both timeout errors subclass them.
  if (error instanceof Anthropic.APIConnectionTimeoutError || error instanceof Anthropic.APIUserAbortError) {
    return new LlmTimeoutError(`llm-proxy gave no answer within ${REQUEST_TIMEOUT_MS / 1000} s`, { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new UpstreamError(503, `llm-proxy unreachable at ${url}`, { cause: error, retryable: true });
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 502;
    return new UpstreamError(relayStatus(status), `llm-proxy returned ${status}: ${error.message}`, {
      cause: error,
      retryable: upstreamVerdict(error.error),
    });
  }
  return error;
}
