import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { closePool } from "../../src/db";
import { TEST_ENV } from "../../vitest.config";
import { testApp } from "../app";

const TEAM = { authorization: `Bearer ${TEST_ENV.TEAM_API_KEY}` };
const app = () => testApp();

afterAll(closePool);

describe("GET /prompts", () => {
  it("lists every step's versions on disk, newest first, with the active one marked", async () => {
    const response = await request(app()).get("/prompts").set(TEAM);

    expect(response.status).toBe(200);
    const classify = response.body.steps.find((s: { step: string }) => s.step === "classify");
    expect(classify.versions.map((v: { version: string }) => v.version)).toEqual(["v6", "v5", "v4", "v3"]);
    expect(classify.versions.filter((v: { active: boolean }) => v.active).map((v: { version: string }) => v.version)).toEqual(["v6"]);
    expect(classify.versions[3]).toMatchObject({ model: "sonnet", notes: expect.stringContaining("Phase 2 final") });
    expect(classify.versions[0]).toMatchObject({ active: true, notes: expect.stringContaining("stage invariant") });
    expect(classify.versions[1]).toMatchObject({ active: false, notes: expect.stringContaining("attachments") });
    expect(response.body.steps.map((s: { step: string }) => s.step)).toEqual([
      "classify",
      "classify-verify",
      "triage",
      "doc-type",
      "extract",
      "extract-verify",
      "field-judge",
    ]);
  });

  it("needs a key", async () => {
    expect((await request(app()).get("/prompts")).status).toBe(401);
  });
});
