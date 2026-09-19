import { afterEach, describe, expect, it, vi } from "vitest";

import { UpstreamError } from "../src/lib/errors";
import { chatViaGateway, isGatewayUrl, listModelsViaGateway } from "../src/llm-gateway";

const URL = "https://box.example/ai/chat";
const LIMITS = { defaultMaxTokens: 8000, timeoutMs: 1000 };
const REPLY = { text: "REMOTE OK", model: "sonnet", stopReason: "end_turn", usage: { inputTokens: 2, outputTokens: 9 }, costUsd: 0.03 };

function answering(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
}

afterEach(() => vi.unstubAllGlobals());

describe("isGatewayUrl", () => {
  it.each([
    ["https://box.example/ai/chat", true],
    ["https://box.example/ai/chat/", false],
    ["http://127.0.0.1:4001", false],
    ["https://box.example", false],
  ])("%s -> %s", (url, expected) => {
    expect(isGatewayUrl(url)).toBe(expected);
  });
});

describe("chatViaGateway", () => {
  it("sends the chat shape with the team bearer and maps the reply", async () => {
    const fetchMock = answering(REPLY);

    const result = await chatViaGateway(URL, { model: "sonnet", messages: [{ role: "user", content: "hi" }] }, LIMITS);

    expect(fetchMock.mock.calls[0][0]).toBe(URL);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-team-key");
    expect(sentBody(fetchMock)).toEqual({ model: "sonnet", messages: [{ role: "user", content: "hi" }], maxTokens: 8000 });
    expect(result).toEqual({ text: "REMOTE OK", model: "sonnet", stopReason: "end_turn", usage: REPLY.usage, costUsd: 0.03 });
  });

  it("caps max tokens at what the route accepts and leaves the schema behind", async () => {
    const fetchMock = answering(REPLY);

    await chatViaGateway(
      URL,
      { model: "sonnet", messages: [{ role: "user", content: "hi" }], maxTokens: 50_000, outputSchema: { type: "object" } },
      LIMITS,
    );

    const body = sentBody(fetchMock);
    expect(body.maxTokens).toBe(8192);
    expect(body).not.toHaveProperty("output_config");
    expect(body).not.toHaveProperty("outputSchema");
  });

  it.each([
    ["a bad request is this caller's fault", 401, 401],
    ["a gateway failure is relayed as 502", 503, 502],
  ])("%s", async (_name, answered, relayed) => {
    answering({ error: "no" }, answered);
    await expect(chatViaGateway(URL, { model: "sonnet", messages: [] }, LIMITS)).rejects.toMatchObject({
      name: "UpstreamError",
      status: relayed,
    });
  });

  it("is a 503 when the gateway cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(chatViaGateway(URL, { model: "sonnet", messages: [] }, LIMITS)).rejects.toMatchObject({ status: 503 });
  });

  it("refuses an answer outside the chat contract rather than passing it on", async () => {
    answering({ text: "hi" });
    const failure = await chatViaGateway(URL, { model: "sonnet", messages: [] }, LIMITS).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(UpstreamError);
    expect((failure as UpstreamError).status).toBe(502);
  });
});

describe("listModelsViaGateway", () => {
  it("reads the aliases from the models route next to the chat one", async () => {
    const fetchMock = answering({ models: [{ id: "sonnet", provider: "claudecli", model: "sonnet" }, { id: "test" }] });

    const models = await listModelsViaGateway(URL, 1000);

    expect(fetchMock.mock.calls[0][0]).toBe("https://box.example/ai/models");
    expect(models).toEqual([
      { id: "sonnet", provider: "claudecli", model: "sonnet" },
      { id: "test", provider: "", model: "" },
    ]);
  });
});
