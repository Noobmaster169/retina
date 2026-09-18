import Anthropic from "@anthropic-ai/sdk";

import type { Caller } from "./auth";

/**
 * The llm-proxy client. The proxy speaks the Anthropic wire, owns every
 * provider (Claude Code subscription, local Ollama) and authenticates nobody
 * — the API's bearer check in auth.ts is the only thing in front of it.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  /** A proxy alias such as "qwen" or "claude", never a provider model id. */
  model: string;
  messages: ChatMessage[];
  system?: string;
  maxTokens?: number;
}

export interface ChatResult {
  text: string;
  /** The provider/model the proxy resolved the alias to, when it says. */
  model: string | null;
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
  /** From the proxy's X-LLM-Proxy-Cost-USD header; null when absent. */
  costUsd: number | null;
}

export interface ModelInfo {
  /** The alias to send as `model`. */
  id: string;
  provider: string;
  /** The provider's model id behind the alias. */
  model: string;
}

/** Loopback on the Monash box; loopback on the dev machine. */
const DEFAULT_PROXY_URL = "http://127.0.0.1:4000";
/** Cold 27B load plus a long generation can take minutes. */
const REQUEST_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_TOKENS = 2048;

/** An error carrying the HTTP status the API should relay. */
export class LlmProxyError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "LlmProxyError";
  }
}

function baseUrl(): string {
  return (process.env.LLM_PROXY_URL ?? DEFAULT_PROXY_URL).replace(/\/+$/, "");
}

/**
 * Qwen 3's reasoning is disabled in the proxy config, but a model tag built
 * from a different template can still inline `<think>…</think>` in front of
 * the answer. Belt to that braces.
 */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/** One non-streaming call. `temperature` is never sent: Claude 5 rejects it. */
export async function chat(caller: Caller, req: ChatRequest): Promise<ChatResult> {
  const url = baseUrl();
  const anthropic = new Anthropic({
    baseURL: url,
    // Not a credential: the proxy reads this as the project name that spend
    // is attributed and budgeted against, so callers show up separately.
    apiKey: `retina-${caller}`,
    maxRetries: 1,
    timeout: REQUEST_TIMEOUT_MS,
  });

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: req.messages,
  };
  if (req.system) params.system = req.system;

  let data: Anthropic.Message;
  let response: Response;
  try {
    ({ data, response } = await anthropic.messages.create(params).withResponse());
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionError) {
      throw new LlmProxyError(503, `llm-proxy unreachable at ${url}`, { cause: error });
    }
    if (error instanceof Anthropic.APIError) {
      const status = error.status ?? 502;
      const relay = status >= 400 && status < 500 ? status : 502;
      throw new LlmProxyError(relay, `llm-proxy returned ${status}: ${error.message}`, { cause: error });
    }
    throw error;
  }

  const cost = Number(response.headers.get("x-llm-proxy-cost-usd"));
  return {
    text: stripThinking(
      data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join(""),
    ),
    model: response.headers.get("x-llm-proxy-model") ?? data.model ?? null,
    stopReason: data.stop_reason ?? null,
    usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens },
    costUsd: Number.isFinite(cost) && response.headers.has("x-llm-proxy-cost-usd") ? cost : null,
  };
}

/** The aliases the proxy is configured with. */
export async function listModels(): Promise<ModelInfo[]> {
  const url = baseUrl();
  let response: Response;
  try {
    response = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(5000) });
  } catch (error) {
    throw new LlmProxyError(503, `llm-proxy unreachable at ${url}`, { cause: error });
  }
  if (!response.ok) throw new LlmProxyError(502, `llm-proxy /v1/models returned ${response.status}`);

  const payload = (await response.json()) as { data?: Record<string, unknown>[] };
  return (payload.data ?? []).map((m) => ({
    id: String(m.id),
    provider: String(m.provider ?? m.owned_by ?? ""),
    model: String(m.model_id ?? ""),
  }));
}
