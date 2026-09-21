/**
 * What a call to the model takes and answers, in this project's shape rather
 * than the Anthropic SDK's. `llm.ts` implements it against the proxy, and the
 * API's own `/ai/chat` route speaks it to the frontend.
 */

export interface ChatImage {
  /** `image/png`, `image/jpeg`, `image/gif` or `image/webp`: what the proxy can hand the model. */
  mediaType: string;
  /** The bytes, base64 encoded, as the Anthropic wire carries them. */
  base64: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Sent alongside the text as image content blocks. Only a user message may carry them. */
  images?: ChatImage[];
}

export interface ChatRequest {
  /** A proxy alias from proxy/proxy.yaml (sonnet, opus, haiku), never a provider model id. */
  model: string;
  messages: ChatMessage[];
  system?: string;
  maxTokens?: number;
  /**
   * A JSON Schema the answer must match. Sent as `output_config.format`, which
   * the proxy turns into `claude -p --json-schema`, so the text that comes back
   * is that JSON object and nothing else.
   */
  outputSchema?: Record<string, unknown>;
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
