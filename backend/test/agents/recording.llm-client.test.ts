import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import { RecordingLlmClient, recordingKey } from "../../src/agents/__fakes__/recording.llm-client";

const dir = mkdtempSync(join(tmpdir(), "retina-recordings-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const REQUEST = { model: "sonnet", system: "Classify.", user: "## subject\nHello", project: "worker" };

describe("RecordingLlmClient", () => {
  it("records a real answer once and replays it without the real client", async () => {
    const real = new FakeLlmClient('{"category":"SPAM"}');
    const recorded = await new RecordingLlmClient("record", dir, real).complete(REQUEST);

    expect(existsSync(join(dir, `${recordingKey(REQUEST)}.json`))).toBe(true);
    const replayed = await new RecordingLlmClient("replay", dir).complete(REQUEST);
    expect(replayed).toEqual(recorded);
    expect(real.requests).toHaveLength(1);
  });

  it("files an answer by model, system prompt and input, and nothing else", () => {
    expect(recordingKey(REQUEST)).toBe(recordingKey({ ...REQUEST }));
    expect(recordingKey(REQUEST)).not.toBe(recordingKey({ ...REQUEST, model: "haiku" }));
    expect(recordingKey(REQUEST)).not.toBe(recordingKey({ ...REQUEST, user: "## subject\nBye" }));
  });

  it("throws on a request it never recorded, so a test cannot reach the network by accident", async () => {
    await expect(new RecordingLlmClient("replay", dir).complete({ ...REQUEST, user: "unseen" })).rejects.toThrow(/record it first/);
  });

  it("refuses to record without a real client", () => {
    expect(() => new RecordingLlmClient("record", dir)).toThrow();
  });
});
