import { LlmUnavailableError, TerminalError } from "../lib/errors";
import { LlmProxyError } from "../lib/errors";
import { chat } from "../llm";

export interface LlmRequest {
  /** A proxy alias from proxy/proxy.yaml, never a provider model id. */
  model: string;
  system: string;
  user: string;
  /** Omitted for the client's generous default. Set only where a step has a reason to cap its answer. */
  maxTokens?: number;
  /** The JSON Schema the answer must match, enforced by the provider and not only asked for in the prompt. */
  outputSchema?: Record<string, unknown>;
  /** Who the proxy bills the call to: retina-worker, retina-chat. */
  project: string;
}

export interface LlmResponse {
  text: string;
  /** The model the proxy resolved the alias to, when it says. */
  model: string | null;
  /** `max_tokens` here means the answer was cut off, which no retry with the same cap can fix. */
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number | null;
  latencyMs: number;
}

/** Every model call in the pipeline goes through this. Tests hand in a fake; nothing in a test reaches the proxy. */
export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/** The real client: the existing proxy client in llm.ts, with its errors sorted into retry or not. */
export function proxyLlmClient(): LlmClient {
  return {
    async complete(request) {
      const started = Date.now();
      try {
        const result = await chat(request.project, {
          model: request.model,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          maxTokens: request.maxTokens,
          outputSchema: request.outputSchema,
        });
        return {
          text: result.text,
          model: result.model,
          stopReason: result.stopReason,
          usage: result.usage,
          costUsd: result.costUsd,
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        if (!(error instanceof LlmProxyError)) throw error;
        // A 429 or anything from 500 up passes; a 4xx is our request and will fail the same way again.
        const transient = error.status === 429 || error.status >= 500;
        if (transient) throw new LlmUnavailableError(error.message, { cause: error });
        throw new TerminalError(error.message, { cause: error });
      }
    },
  };
}
