import { z } from "zod";

import { config } from "./config";
import { relayStatus, TerminalError, UpstreamError } from "./lib/errors";
import type { ChatRequest, ChatResult, ModelInfo } from "./llm";

/**
 * The second door to a proxy. Where the proxy itself cannot be reached, another
 * Retina API's `/ai/chat` fronts one on its own host: it takes the team bearer
 * and speaks this project's chat shape rather than the Anthropic wire. `llm.ts`
 * picks this transport from the URL; nothing above it knows which one ran.
 */

/** The gateway is named by its endpoint: a URL ending in `/ai/chat` is an API, anything else a proxy. */
export function isGatewayUrl(url: string): boolean {
  return url.endsWith("/ai/chat");
}

/** config.ts refuses to boot a gateway URL without this key, so reaching the throw means that check was lost. */
function bearer(): string {
  if (!config.TEAM_API_KEY) throw new TerminalError("TEAM_API_KEY is unset but the gateway transport needs it");
  return config.TEAM_API_KEY;
}

/** `/ai/chat` refuses anything above this, so a request built for the proxy is capped rather than rejected. */
const GATEWAY_MAX_TOKENS = 8192;

/** What `/ai/chat` answers: this project's own ChatResult, so the two transports agree by construction. */
const GatewayReply = z.object({
  text: z.string(),
  model: z.string().nullish(),
  stopReason: z.string().nullish(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  costUsd: z.number().nullish(),
});

const GatewayModels = z.object({
  models: z.array(z.object({ id: z.string(), provider: z.string().nullish(), model: z.string().nullish() })),
});

/**
 * A Retina api relays an `UpstreamError` as `{ error, retryable }`, so the
 * verdict the far proxy stated survives this extra hop instead of being
 * re-guessed from a status that has already been flattened once.
 */
const GatewayError = z.object({ retryable: z.boolean().nullish() });

function gatewayVerdict(body: string): boolean | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    // A gateway that answered in plain text states no verdict; the status decides.
    return null;
  }
  const parsed = GatewayError.safeParse(json);
  return parsed.success ? (parsed.data.retryable ?? null) : null;
}

async function send(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${bearer()}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new UpstreamError(503, `llm gateway unreachable at ${url}`, { cause: error, retryable: true });
  }
  if (response.ok) return response;
  const body = await response.text().catch(() => "");
  throw new UpstreamError(relayStatus(response.status), `llm gateway returned ${response.status}: ${body.slice(0, 200)}`, {
    retryable: gatewayVerdict(body),
  });
}

/**
 * `outputSchema` is dropped: `/ai/chat` has no structured output, so the schema
 * reaches the model through the prompt only and callStructured's zod parse is
 * the whole guarantee. Everything else maps across unchanged.
 */
export async function chatViaGateway(
  url: string,
  req: ChatRequest,
  limits: { defaultMaxTokens: number; timeoutMs: number },
): Promise<ChatResult> {
  const body = {
    model: req.model,
    messages: req.messages,
    maxTokens: Math.min(req.maxTokens ?? limits.defaultMaxTokens, GATEWAY_MAX_TOKENS),
    ...(req.system ? { system: req.system } : {}),
  };
  const response = await send(
    url,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    limits.timeoutMs,
  );
  const parsed = GatewayReply.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new UpstreamError(502, "llm gateway answered outside the chat contract");
  return {
    text: parsed.data.text,
    model: parsed.data.model ?? null,
    stopReason: parsed.data.stopReason ?? null,
    usage: parsed.data.usage,
    costUsd: parsed.data.costUsd ?? null,
  };
}

/** The gateway lists the same aliases under `/ai/models`, already mapped. */
export async function listModelsViaGateway(chatUrl: string, timeoutMs: number): Promise<ModelInfo[]> {
  const response = await send(chatUrl.replace(/\/chat$/, "/models"), {}, timeoutMs);
  const parsed = GatewayModels.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new UpstreamError(502, "llm gateway answered outside the models contract");
  return parsed.data.models.map((m) => ({ id: m.id, provider: m.provider ?? "", model: m.model ?? "" }));
}
