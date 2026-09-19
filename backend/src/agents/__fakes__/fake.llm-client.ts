import type { LlmClient, LlmRequest, LlmResponse } from "../llm-client";

/** `{ text, stopReason }` is an answer that stopped for a reason other than being finished. */
type Reply = string | Error | { text: string; stopReason: string } | ((request: LlmRequest) => string);

/**
 * Answers from a queue of replies, or from one function for every call. A
 * string is the model's text; an Error is thrown, as the proxy client would.
 */
export class FakeLlmClient implements LlmClient {
  readonly requests: LlmRequest[] = [];
  private readonly queue: Reply[];

  constructor(replies: Reply | Reply[]) {
    this.queue = Array.isArray(replies) ? [...replies] : [replies];
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    // The last reply repeats, so one reply serves any number of calls.
    const reply = this.queue.length > 1 ? this.queue.shift() : this.queue[0];
    if (reply === undefined) throw new Error("FakeLlmClient has no reply");
    if (reply instanceof Error) throw reply;
    const text = typeof reply === "function" ? reply(request) : typeof reply === "string" ? reply : reply.text;
    return {
      text,
      model: `fake/${request.model}`,
      stopReason: typeof reply === "object" ? reply.stopReason : "end_turn",
      usage: { inputTokens: 100, outputTokens: 20 },
      costUsd: 0.001,
      latencyMs: 5,
    };
  }
}
