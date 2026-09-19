import { describe, expect, it, vi } from "vitest";

import { CreateRunBody } from "../../src/contracts";
import type { Queryable } from "../../src/db";
import { planRun } from "../../src/routes/run-plan";

// An experiment's env override with a typo in it, and a proxy that knows only sonnet.
vi.mock("../../src/config", async (original) => {
  const actual = await original<typeof import("../../src/config")>();
  return { config: { ...actual.config, LLM_MODEL_CLASSIFY: undefined, LLM_MODEL_VERIFY: "sonet" } };
});
vi.mock("../../src/llm", () => ({ chat: vi.fn(), listModels: vi.fn(async () => [{ id: "sonnet", provider: "claudecli", model: "sonnet" }]) }));

const NO_DB: Queryable = {
  query: async () => {
    throw new Error("the plan must refuse before it reads the database");
  },
} as unknown as Queryable;

describe("planRun", () => {
  it("refuses an env model override that is not a proxy alias, as it would a run's own", async () => {
    await expect(planRun(NO_DB, CreateRunBody.parse({}))).resolves.toEqual({ ok: false, error: "not a proxy alias: sonet" });
  });
});
