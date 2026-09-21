import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import { loadPrompt } from "../../src/agents/prompts/registry";
import { entityProfile } from "../../src/ontology/repositories";
import { locatePortIfNeeded } from "../../src/queues/locate-ports";
import { inRollback } from "../db";

async function seedPort(tx: PoolClient, attributes: Record<string, string | null>): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    "insert into core.entities (kind, canonical, attributes) values ('port', 'PORT ALPHA', $1::jsonb) returning id::text as id",
    [JSON.stringify(attributes)],
  );
  return rows[0].id;
}

const prompt = loadPrompt("port-locate", "v1");

describe("locatePortIfNeeded", () => {
  it("writes the coordinates and where they came from", async () => {
    await inRollback(async (tx) => {
      const id = await seedPort(tx, { country: "Atlantis", locode: "ATALP" });
      const llm = new FakeLlmClient(
        JSON.stringify({ lat: 10.5, lon: -20.25, confidence: 0.9, basis: "search", url: "https://example.org/alpha" }),
      );
      expect(await locatePortIfNeeded({ pool: tx, llm }, prompt, id)).toBe("located");
      const stored = await entityProfile.read(tx, id);
      expect(stored?.attributes).toMatchObject({ lat: "10.5", lon: "-20.25", country: "Atlantis" });
      expect(stored?.attributeSources.lat).toMatchObject({ source: "search", confidence: 0.9 });
      expect(llm.requests[0]?.user).toContain("ATALP");
    });
  });

  it("leaves a located port alone and spends no call", async () => {
    await inRollback(async (tx) => {
      const id = await seedPort(tx, { lat: "1", lon: "2" });
      const llm = new FakeLlmClient(new Error("should not be called"));
      expect(await locatePortIfNeeded({ pool: tx, llm }, prompt, id)).toBe("kept");
      expect(llm.requests).toHaveLength(0);
    });
  });

  it("stores nothing for a port the model could not place", async () => {
    await inRollback(async (tx) => {
      const id = await seedPort(tx, { country: null });
      const llm = new FakeLlmClient(JSON.stringify({ lat: null, lon: null, confidence: 0.2, basis: "model", url: null }));
      expect(await locatePortIfNeeded({ pool: tx, llm }, prompt, id)).toBe("unplaced");
      const stored = await entityProfile.read(tx, id);
      expect(stored?.attributes.lat ?? null).toBeNull();
    });
  });
});

describe("a profile write", () => {
  it("keeps the coordinates the locate step wrote", async () => {
    await inRollback(async (tx) => {
      const id = await seedPort(tx, { lat: "1.5", lon: "2.5", country: "Old" });
      await entityProfile.write(tx, id, {
        markdown: "# PORT ALPHA",
        searchText: "port alpha",
        attributes: { country: "New", region: null, subregion: null, locode: null, coast: null },
        attributeSources: { country: { source: "model", confidence: 0.8, llmCallId: null } },
      });
      const stored = await entityProfile.read(tx, id);
      expect(stored?.attributes).toMatchObject({ country: "New", lat: "1.5", lon: "2.5" });
    });
  });
});
