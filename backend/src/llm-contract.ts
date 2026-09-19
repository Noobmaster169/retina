/**
 * What a transport to the model takes and answers, independent of which one
 * runs. `llm.ts` speaks the Anthropic wire to the proxy and `llm-gateway.ts`
 * speaks this project's chat shape to another Retina API; both implement these,
 * which is what lets `chat()` hide the choice.
 *
 * Here rather than in either transport so neither has to import the other for a
 * type.
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
  /**
   * A JSON Schema the answer must match. Sent as `output_config.format`, which
   * the proxy turns into the provider's own structured output (`--json-schema`
   * for `claude -p`, `response_format` for Ollama), so the text that comes back
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
