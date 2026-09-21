import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import { locatePort, PortLocateOutput } from "../../src/agents/port-locate";
import { loadPrompt } from "../../src/agents/prompts/registry";
import { inRollback } from "../db";

describe("port-locate", () => {
  it("reads a located answer and says where it came from", async () => {
    await inRollback(async (tx) => {
      const llm = new FakeLlmClient(
        JSON.stringify({ lat: 1.2644, lon: 103.82, confidence: 0.95, basis: "search", url: "https://example.org/singapore" }),
      );
      const prompt = loadPrompt("port-locate", "v1");
      const { value } = await locatePort({ llm, pool: tx }, prompt, { canonical: "SINGAPORE", country: "Singapore", locode: "SGSIN" });
      expect(value).toEqual({ lat: 1.2644, lon: 103.82, confidence: 0.95, basis: "search", url: "https://example.org/singapore" });
      expect(prompt.model).toBe("sonnet-web");
      expect(llm.requests[0]?.user).toContain("SINGAPORE");
    });
  });

  it("refuses a latitude off the globe", () => {
    expect(PortLocateOutput.safeParse({ lat: 95, lon: 0, confidence: 1, basis: "model", url: null }).success).toBe(false);
  });
});
