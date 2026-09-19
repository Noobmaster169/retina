import { describe, expect, it } from "vitest";

import { httpDocExtractClient } from "../../src/doc-extract";
import { DocExtractUnavailableError, RetryableError, TerminalError } from "../../src/lib/errors";

const answer = {
  format: "txt",
  text: "SHIPPING INSTRUCTION",
  pages: [{ index: 1, text: "SHIPPING INSTRUCTION", source: "text_layer", ocr_confidence: null }],
  unreadable: false,
  scanned: false,
  warnings: [],
  bytes: 20,
};

/** A fetch that answers with one canned response, or throws, and remembers what it was asked. */
function fetching(reply: { status: number; body: unknown } | Error) {
  const calls: { url: string; body: unknown }[] = [];
  const impl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
  };
  return { impl, calls };
}

describe("httpDocExtractClient", () => {
  it("posts the key and filename in the service's field names and parses the answer", async () => {
    const { impl, calls } = fetching({ status: 200, body: answer });
    const client = httpDocExtractClient("http://doc-extract:8000/", impl);

    const result = await client.extract({ key: "runs/r/e/attachments/e_SI.txt", filename: "e_SI.txt", contentType: "text/plain" });

    expect(result).toEqual(answer);
    expect(calls).toEqual([
      { url: "http://doc-extract:8000/extract", body: { key: "runs/r/e/attachments/e_SI.txt", filename: "e_SI.txt", content_type: "text/plain" } },
    ]);
  });

  it("render posts the out prefix as out_prefix", async () => {
    const { impl, calls } = fetching({ status: 200, body: { pages: [{ index: 1, key: "p/1.png", width: 10, height: 20 }] } });
    const client = httpDocExtractClient("http://doc-extract:8000", impl);

    const result = await client.render({ key: "k", filename: "e.pdf", outPrefix: "p" });

    expect(result.pages).toEqual([{ index: 1, key: "p/1.png", width: 10, height: 20 }]);
    expect(calls[0].body).toEqual({ key: "k", filename: "e.pdf", out_prefix: "p", dpi: null });
  });

  it.each([
    ["an unreachable service", new TypeError("fetch failed"), DocExtractUnavailableError],
    ["a failure the service calls retryable: its store was down", { status: 503, body: { error: "object store: refused", retryable: true } }, DocExtractUnavailableError],
    ["a 5xx with no verdict", { status: 502, body: "bad gateway" }, DocExtractUnavailableError],
    ["a key that is not there", { status: 404, body: { error: "no such object", retryable: false } }, TerminalError],
    ["an answer of the wrong shape", { status: 200, body: { format: "txt" } }, TerminalError],
  ])("%s", async (_name, reply, expected) => {
    const client = httpDocExtractClient("http://doc-extract:8000", fetching(reply).impl);
    await expect(client.extract({ key: "k", filename: "f.txt" })).rejects.toBeInstanceOf(expected);
  });

  it("a timeout spends an attempt rather than pausing the queue", async () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const client = httpDocExtractClient("http://doc-extract:8000", fetching(timeout).impl);
    const failure = client.extract({ key: "k", filename: "f.txt" });
    await expect(failure).rejects.toBeInstanceOf(RetryableError);
    await expect(failure).rejects.not.toBeInstanceOf(DocExtractUnavailableError);
  });
});
