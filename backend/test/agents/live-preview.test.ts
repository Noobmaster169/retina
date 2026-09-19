import { describe, expect, it } from "vitest";

import { livePreview } from "../../src/agents/live-preview";
import type { LiveCall, LiveCalls } from "../../src/live";
import { MemoryLiveCalls } from "../../src/live/__fakes__/memory.live-calls";

const OF = { emailRunId: "7", runId: "r", step: "classify", model: "sonnet", promptVersion: "v3", attempt: 1 };

describe("livePreview", () => {
  it("writes the text so far at most every 250 ms, and the first piece at once", async () => {
    let clock = 1_000;
    const live = new MemoryLiveCalls();
    const preview = livePreview(live, OF, () => clock);

    await preview.onText("{");
    clock += 100;
    await preview.onText('{"cat');
    clock += 200;
    await preview.onText('{"category"');

    expect(live.writes.map((w) => w.text)).toEqual(["{", '{"category"']);
    expect(live.writes[0]).toMatchObject({ emailRunId: "7", step: "classify", model: "sonnet", attempt: 1 });
    expect(live.writes[0]).not.toHaveProperty("runId");
  });

  it("clears the email's live call when the call ends", async () => {
    const live = new MemoryLiveCalls();
    const preview = livePreview(live, OF);
    await preview.onText("{");
    expect(await live.get(["7"])).toHaveLength(1);

    await preview.end();
    expect(await live.get(["7"])).toEqual([]);
  });

  it("never fails the model call over a preview it could not write", async () => {
    const broken: LiveCalls = {
      put: async (_call: LiveCall) => Promise.reject(new Error("redis is down")),
      clear: async () => Promise.reject(new Error("redis is down")),
      get: async () => [],
      close: async () => undefined,
    };
    const preview = livePreview(broken, OF);
    await expect(preview.onText("{")).resolves.toBeUndefined();
    await expect(preview.end()).resolves.toBeUndefined();
  });
});
