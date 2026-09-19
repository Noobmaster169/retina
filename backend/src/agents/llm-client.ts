import { isTransient, LlmUnavailableError, TerminalError, UpstreamError } from "../lib/errors";
import { childLogger } from "../lib/logger";
import { chat } from "../llm";
import { type LlmSlot, llmSlots } from "./llm-slot";

const log = childLogger({ module: "llm-client" });

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

export interface ProxyClientOptions {
  /** How many calls this process may have in flight at once. */
  maxConcurrency?: number;
  /** The wait before each retry of a transient failure; its length is the number of retries. */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const RETRY_DELAYS_MS = [1000, 3000];

/** 0.75x to 1.25x the base, so calls that failed together do not all come back together. */
function jittered(baseMs: number, random: () => number): number {
  return Math.round(baseMs * (0.75 + 0.5 * random()));
}

/**
 * The real client: the proxy client in llm.ts, capped at `maxConcurrency`
 * calls in flight, with a transient failure retried twice before it is given
 * up to the queue.
 *
 * Whether a failure is transient is the proxy's own verdict (`isTransient`),
 * never a status list: an unknown provider and a dead upstream are both 500,
 * and retrying the first loops a typo forever. A retry waits outside the slot,
 * so a sleeping call never holds up one that could run.
 */
export function proxyLlmClient(options: ProxyClientOptions = {}): LlmClient {
  const slot: LlmSlot = llmSlots(options.maxConcurrency ?? Number.POSITIVE_INFINITY);
  const delays = options.retryDelaysMs ?? RETRY_DELAYS_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;

  async function once(request: LlmRequest): Promise<LlmResponse> {
    const started = Date.now();
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
  }

  return {
    async complete(request) {
      for (let retry = 0; ; retry++) {
        try {
          return await slot(() => once(request));
        } catch (error) {
          if (!(error instanceof UpstreamError)) throw error;
          if (!isTransient(error)) throw new TerminalError(error.message, { cause: error });
          if (retry >= delays.length) throw new LlmUnavailableError(error.message, { cause: error });
          const waitMs = jittered(delays[retry], random);
          log.warn({ model: request.model, status: error.status, retry: retry + 1, waitMs, err: error.message }, "transient model failure, retrying");
          await sleep(waitMs);
        }
      }
    },
  };
}
