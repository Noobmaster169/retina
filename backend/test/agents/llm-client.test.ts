import { beforeEach, describe, expect, it, vi } from "vitest";

import { proxyLlmClient } from "../../src/agents/llm-client";
import { LlmUnavailableError, TerminalError, UpstreamError } from "../../src/lib/errors";

const chat = vi.hoisted(() => vi.fn());
vi.mock("../../src/llm", () => ({ chat }));

const REQUEST = { model: "sonnet", system: "s", user: "u", project: "retina-worker" };

beforeEach(() => chat.mockReset());

describe("proxyLlmClient error classification", () => {
  /**
   * The third column is the whole point: status alone cannot tell a provider
   * name that does not exist from an upstream that fell over, because the proxy
   * answers 500 for both. Reading the proxy's own verdict is what stops a typo
   * in LLM_MODEL_CLASSIFY being requeued forever without spending an attempt.
   */
  it.each([
    ["an outage the proxy calls transient", 502, true, LlmUnavailableError],
    ["rate limiting", 429, true, LlmUnavailableError],
    ["an unknown provider, which is a 500 that will never succeed", 500, false, TerminalError],
    ["a bad request", 400, false, TerminalError],
    ["a 5xx with no verdict falls back to the status", 503, null, LlmUnavailableError],
    ["a 4xx with no verdict falls back to the status", 404, null, TerminalError],
  ])("%s", async (_name, status, retryable, expected) => {
    chat.mockRejectedValueOnce(new UpstreamError(status, "upstream said no", { retryable }));

    await expect(proxyLlmClient().complete(REQUEST)).rejects.toBeInstanceOf(expected);
  });

  it("lets an error that is not the upstream's through untouched", async () => {
    const bug = new TypeError("undefined is not a function");
    chat.mockRejectedValueOnce(bug);

    await expect(proxyLlmClient().complete(REQUEST)).rejects.toBe(bug);
  });

  it("times the call and passes the answer through", async () => {
    chat.mockResolvedValueOnce({
      text: "OK",
      model: "claudecli/sonnet",
      stopReason: "end_turn",
      usage: { inputTokens: 3, outputTokens: 4 },
      costUsd: 0.01,
    });

    const response = await proxyLlmClient().complete(REQUEST);

    expect(response).toMatchObject({ text: "OK", model: "claudecli/sonnet", costUsd: 0.01 });
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
