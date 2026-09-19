import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { UpstreamError } from "./lib/errors";
import type { ChatRequest, ChatResult, ModelInfo } from "./llm-contract";
import { asLlmError, baseUrl, messageParams, proxyClient, upstreamVerdict } from "./llm-wire";

export type { ChatMessage, ChatRequest, ChatResult, ModelInfo } from "./llm-contract";
export { chatStream } from "./llm-stream";

/**
 * The llm-proxy client. The proxy is the llm-proxy service of this compose
 * stack (proxy/ in this repo): it speaks the Anthropic wire, drives the Claude
 * Code subscription and authenticates nobody, so it is reachable only on the
 * compose network and the API's bearer check in auth.ts is what stands in
 * front of the models.
 */

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

/** One non-streaming call, billed to `project` in the proxy. */
export async function chat(project: string, req: ChatRequest): Promise<ChatResult> {
  let data: Anthropic.Message;
  let response: Response;
  try {
    ({ data, response } = await proxyClient(project).messages.create(messageParams(req)).withResponse());
  } catch (error) {
    throw asLlmError(error);
  }

  const cost = Number(response.headers.get("x-llm-proxy-cost-usd"));
  return {
    text: data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim(),
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
