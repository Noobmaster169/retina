import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { config } from "./config";
import { LlmTimeoutError, relayStatus, UpstreamError } from "./lib/errors";
import type { ChatRequest, ChatResult, ModelInfo } from "./llm-contract";
import { chatViaGateway, isGatewayUrl, listModelsViaGateway } from "./llm-gateway";

export type { ChatMessage, ChatRequest, ChatResult, ModelInfo } from "./llm-contract";

/**
 * The llm-proxy client. The proxy speaks the Anthropic wire, owns every
 * provider (Claude Code subscription, local Ollama) and authenticates nobody
 * — the API's bearer check in auth.ts is the only thing in front of it.
 *
 * Where the proxy cannot be reached directly, `LLM_PROXY_URL` may instead name
 * another Retina API's `/ai/chat`, which fronts a proxy on its own host. That
 * door takes a bearer and speaks this project's chat shape rather than the
 * Anthropic wire, so the transport is chosen from the URL. Everything above
 * this module sees one `chat()` either way.
 */

/** Cold 27B load plus a long generation can take minutes. */
const REQUEST_TIMEOUT_MS = 600_000;
/**
 * The wire requires a cap, so this is a generous one, not a budget: a cap that
 * bites truncates the answer mid-object. 8000 is the most the proxy passes to
 * Ollama; `claude -p` has no such setting and ignores it.
 */
const DEFAULT_MAX_TOKENS = 8000;

function baseUrl(): string {
  return config.LLM_PROXY_URL.replace(/\/+$/, "");
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

function upstreamVerdict(body: unknown): boolean | null {
  const parsed = ProxyErrorBody.safeParse(body);
  return parsed.success ? (parsed.data.error?.retryable ?? null) : null;
}

/** `GET /v1/models`. The alias is `id`; the rest is what the proxy resolved it to. */
const ModelListBody = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        provider: z.string().nullish(),
        owned_by: z.string().nullish(),
        model_id: z.string().nullish(),
      }),
    )
    .default([]),
});

/** The `/ai/chat` of another Retina API, or null when the URL is a proxy we speak the Anthropic wire to. */
function gatewayUrl(): string | null {
  const url = baseUrl();
  return isGatewayUrl(url) ? url : null;
}

/**
 * Qwen 3's reasoning is disabled in the proxy config, but a model tag built
 * from a different template can still inline `<think>…</think>` in front of
 * the answer. Belt to that braces.
 */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/** One non-streaming call, billed to `project` in the proxy. `temperature` is never sent: Claude 5 rejects it. */
export async function chat(project: string, req: ChatRequest): Promise<ChatResult> {
  const gateway = gatewayUrl();
  if (gateway) {
    const result = await chatViaGateway(gateway, req, {
      defaultMaxTokens: DEFAULT_MAX_TOKENS,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    return { ...result, text: stripThinking(result.text) };
  }

  const url = baseUrl();
  const anthropic = new Anthropic({
    baseURL: url,
    // Not a credential: the proxy reads this as the project name that spend
    // is attributed and budgeted against, so callers show up separately.
    apiKey: `retina-${project}`,
    // Retries belong to the caller: BullMQ for the pipeline, the user for chat. A
    // silent second try here doubled a hung call to 20 minutes and hid a call from the ledger.
    maxRetries: 0,
    timeout: REQUEST_TIMEOUT_MS,
  });

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: req.messages,
  };
  if (req.system) params.system = req.system;
  if (req.outputSchema) params.output_config = { format: { type: "json_schema", schema: req.outputSchema } };

  let data: Anthropic.Message;
  let response: Response;
  try {
    ({ data, response } = await anthropic.messages.create(params).withResponse());
  } catch (error) {
    // Before the connection check: the SDK's timeout error is a subclass of it.
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      throw new LlmTimeoutError(`llm-proxy gave no answer within ${REQUEST_TIMEOUT_MS / 1000} s`, { cause: error });
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new UpstreamError(503, `llm-proxy unreachable at ${url}`, { cause: error, retryable: true });
    }
    if (error instanceof Anthropic.APIError) {
      const status = error.status ?? 502;
      throw new UpstreamError(relayStatus(status), `llm-proxy returned ${status}: ${error.message}`, {
        cause: error,
        retryable: upstreamVerdict(error.error),
      });
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
  const gateway = gatewayUrl();
  if (gateway) return listModelsViaGateway(gateway, 5000);

  const url = baseUrl();
  let response: Response;
  try {
    response = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(5000) });
  } catch (error) {
    throw new UpstreamError(503, `llm-proxy unreachable at ${url}`, { cause: error, retryable: true });
  }
  if (!response.ok) {
    throw new UpstreamError(502, `llm-proxy /v1/models returned ${response.status}`, {
      retryable: upstreamVerdict(await response.json().catch(() => null)),
    });
  }

  const parsed = ModelListBody.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new UpstreamError(502, "llm-proxy /v1/models answered outside the contract");
  return parsed.data.data.map((m) => ({
    id: m.id,
    provider: m.provider ?? m.owned_by ?? "",
    model: m.model_id ?? "",
  }));
}
