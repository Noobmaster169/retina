import { beforeEach, describe, expect, it, vi } from "vitest";

import { proxyLlmClient } from "../../src/agents/llm-client";
import { llmSlots } from "../../src/agents/llm-slot";
import { LlmTimeoutError, LlmUnavailableError, RunPausedError, TerminalError, UpstreamError } from "../../src/lib/errors";

const chat = vi.hoisted(() => vi.fn());
vi.mock("../../src/llm", () => ({ chat }));

const REQUEST = { model: "sonnet", system: "s", user: "u", project: "retina-worker" };
const ANSWER = {
  text: "OK",
  model: "claudecli/sonnet",
  stopReason: "end_turn",
  usage: { inputTokens: 3, outputTokens: 4 },
  costUsd: 0.01,
};

/** A client whose retries wait no real time, and which records the waits it asked for. */
function client(random = 0.5) {
  const waits: number[] = [];
  const llm = proxyLlmClient({
    sleep: async (ms) => {
      waits.push(ms);
    },
    random: () => random,
  });
  return { llm, waits };
}

// A braced body: vitest calls a function returned from beforeEach as cleanup, and mockReset returns the mock.
beforeEach(() => {
  chat.mockReset();
});

describe("proxyLlmClient error classification", () => {
  /**
   * The third column is the whole point: status alone cannot tell a provider
   * name that does not exist from an upstream that fell over, because the proxy
   * answers 500 for both. Reading the proxy's own verdict is what stops a typo
   * in LLM_MODEL_CLASSIFY being requeued forever without spending an attempt.
   * The fifth is how many times the proxy was asked: a transient failure is
   * retried twice, a permanent one never.
   */
  it.each([
    ["an outage the proxy calls transient", 502, true, LlmUnavailableError, 3],
    ["rate limiting", 429, true, LlmUnavailableError, 3],
    ["an unknown provider, which is a 500 that will never succeed", 500, false, TerminalError, 1],
    ["a bad request", 400, false, TerminalError, 1],
    ["a 5xx with no verdict falls back to the status", 503, null, LlmUnavailableError, 3],
    ["a 4xx with no verdict falls back to the status", 404, null, TerminalError, 1],
  ])("%s", async (_name, status, retryable, expected, calls) => {
    chat.mockImplementation(async () => {
      throw new UpstreamError(status, "upstream said no", { retryable });
    });

    await expect(client().llm.complete(REQUEST)).rejects.toBeInstanceOf(expected);
    expect(chat).toHaveBeenCalledTimes(calls);
  });

  it("lets an error that is not the upstream's through untouched, without retrying", async () => {
    const bug = new TypeError("undefined is not a function");
    chat.mockImplementation(async () => {
      throw bug;
    });

    await expect(client().llm.complete(REQUEST)).rejects.toBe(bug);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("times the call and passes the answer through", async () => {
    chat.mockResolvedValueOnce(ANSWER);

    const response = await client().llm.complete(REQUEST);

    expect(response).toMatchObject({ text: "OK", model: "claudecli/sonnet", costUsd: 0.01 });
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("proxyLlmClient retries", () => {
  it("answers when a retry succeeds, and the caller never sees the blip", async () => {
    chat.mockRejectedValueOnce(new UpstreamError(502, "blip", { retryable: true })).mockResolvedValueOnce(ANSWER);
    const { llm, waits } = client();

    await expect(llm.complete(REQUEST)).resolves.toMatchObject({ text: "OK" });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([1000]);
  });

  it.each([
    ["the low end of the jitter", 0, [750, 2250]],
    ["the middle", 0.5, [1000, 3000]],
    ["the high end", 1, [1250, 3750]],
  ])("waits about 1 s then about 3 s: %s", async (_name, random, expected) => {
    chat.mockImplementation(async () => {
      throw new UpstreamError(503, "down", { retryable: true });
    });
    const { llm, waits } = client(random);

    await expect(llm.complete(REQUEST)).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(waits).toEqual(expected);
  });

  it("does not retry a timeout: each try already cost the whole timeout, so the queue decides", async () => {
    const hung = new LlmTimeoutError("no answer within 600 s");
    chat.mockImplementation(async () => {
      throw hung;
    });
    const { llm, waits } = client();

    await expect(llm.complete(REQUEST)).rejects.toBe(hung);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it("does not wait at all before giving up on a permanent failure", async () => {
    chat.mockImplementation(async () => {
      throw new UpstreamError(500, "unknown provider", { retryable: false });
    });
    const { llm, waits } = client();

    await expect(llm.complete(REQUEST)).rejects.toBeInstanceOf(TerminalError);
    expect(waits).toEqual([]);
  });
});

/**
 * A pause abandons the call. The SDK reports a cancelled request the same way
 * it reports one that ran out of time, and the difference decides whether the
 * queue retries the email or parks the job, so the client says which it was
 * from the signal rather than from the error it caught.
 */
describe("proxyLlmClient under a pause", () => {
  it("names an abandoned call a pause, not the timeout the SDK reports", async () => {
    const stop = new AbortController();
    chat.mockImplementation(async () => {
      stop.abort();
      throw new LlmTimeoutError("no answer within 600 s");
    });
    const { llm, waits } = client();

    await expect(llm.complete(REQUEST, stop.signal)).rejects.toBeInstanceOf(RunPausedError);
    expect(waits).toEqual([]);
  });

  it("buys no further call once the pause has landed, not even a retry already owed", async () => {
    const stop = new AbortController();
    chat.mockImplementationOnce(async () => {
      throw new UpstreamError(503, "down", { retryable: true });
    });
    // The pause lands while the first failure is waiting out its backoff.
    const waiting = proxyLlmClient({ sleep: async () => stop.abort() });

    await expect(waiting.complete(REQUEST, stop.signal)).rejects.toBeInstanceOf(RunPausedError);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("refuses before the first call when the run was already paused", async () => {
    const stop = new AbortController();
    stop.abort();
    const { llm } = client();

    await expect(llm.complete(REQUEST, stop.signal)).rejects.toBeInstanceOf(RunPausedError);
    expect(chat).not.toHaveBeenCalled();
  });

  it("hands the signal to the proxy, so the request is cancelled and not merely ignored", async () => {
    chat.mockResolvedValue(ANSWER);
    const stop = new AbortController();
    const { llm } = client();

    await llm.complete(REQUEST, stop.signal);
    expect(chat).toHaveBeenCalledWith("retina-worker", expect.anything(), stop.signal);
  });
});

describe("llmSlots", () => {
  it("never has more than the cap in flight, and runs every call in the end", async () => {
    const slot = llmSlots(2);
    let inFlight = 0;
    let most = 0;
    const work = async (n: number) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return n;
    };

    const results = await Promise.all([1, 2, 3, 4, 5, 6, 7].map((n) => slot(() => work(n))));

    expect(results).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(most).toBe(2);
  });

  it("frees the slot when a call fails", async () => {
    const slot = llmSlots(1);
    await expect(slot(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(slot(async () => "next")).resolves.toBe("next");
  });

  // The cap's own evidence. The exit checklist asks whether in-flight calls
  // ever exceed it, and "they cannot, by construction" is a claim about code.
  it("reports the most calls it ever had in flight, and never more than the cap", async () => {
    const slot = llmSlots(3);
    const hold = () => new Promise((resolve) => setTimeout(resolve, 5));

    expect(slot.peak()).toBe(0);
    await Promise.all(Array.from({ length: 10 }, () => slot(hold)));

    expect(slot.peak()).toBe(3);
  });

  it("reports a peak below the cap when nothing ever asked for that many", async () => {
    const slot = llmSlots(8);

    await slot(async () => "one");
    await slot(async () => "two");

    expect(slot.peak()).toBe(1);
  });

  it("caps the real client too", async () => {
    let inFlight = 0;
    let most = 0;
    chat.mockImplementation(async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return ANSWER;
    });
    const llm = proxyLlmClient({ maxConcurrency: 2 });

    await Promise.all(Array.from({ length: 6 }, () => llm.complete(REQUEST)));

    expect(most).toBe(2);
  });
});
