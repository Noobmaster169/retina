import { describe, expect, it } from "vitest";

import { callTool, toolDescriptions, TOOLS } from "../../src/agents/chat/tools";
import { argsSignature } from "../../src/agents/chat/tools/args-signature";
import { getPool, getRoPool } from "../../src/db";

describe("argsSignature", () => {
  it.each([
    ["find_entity", '{ text: string, kind?: "port" | "party" }'],
    ["list_entities", '{ kind: "port" | "party", contains?: string, limit?: number }'],
    ["get_entity", "{ id: string | number }"],
    ["profile_column", "{ relation: string, column: string }"],
    ["load_skill", "{ name: string }"],
    ["run_sql", "{ sql: string, purpose: string }"],
    ["run_recipe", "{ name: string, params?: { name: value, ... } }"],
  ] as const)("%s takes %s", (name, signature) => {
    expect(argsSignature(TOOLS[name].schema)).toBe(signature);
  });

  it("is in the tool list the prompt shows, under every tool", () => {
    const text = toolDescriptions();
    for (const name of Object.keys(TOOLS)) expect(text).toContain(`- ${name}:`);
    expect(text.match(/\n  args: \{/g)).toHaveLength(Object.keys(TOOLS).length);
  });
});

describe("callTool", () => {
  const ctx = () => ({ pool: getPool(), roPool: getRoPool(), runId: null, emailId: null });

  it("says what the tool takes when the arguments do not fit, so the next call can be right", async () => {
    const outcome = await callTool("find_entity", { name: "Acme" }, ctx());
    expect(outcome.ok).toBe(false);
    expect(outcome.text).toContain('It takes exactly: { text: string, kind?: "port" | "party" }');
  });

  it("takes a recipe's parameters beside its name as well as inside params", async () => {
    const flat = await callTool("run_recipe", { name: "run_overview", run_id: "00000000-0000-4000-8000-000000000000" }, ctx());
    const nested = await callTool("run_recipe", { name: "run_overview", params: { run_id: "00000000-0000-4000-8000-000000000000" } }, ctx());
    expect(flat.ok).toBe(true);
    expect(nested.ok).toBe(true);
    expect(flat.recipe?.params).toEqual(nested.recipe?.params);
  });

  it("hands a tool that throws back as a refusal", async () => {
    const broken = { ...ctx(), roPool: { query: () => Promise.reject(new Error("the connection went away")) } };
    const outcome = await callTool("list_entities", { kind: "port" }, broken);
    expect(outcome.ok).toBe(false);
    expect(outcome.text).toContain("list_entities failed: the connection went away");
  });

  it("names the recipes that exist when asked for one that does not", async () => {
    const outcome = await callTool("run_recipe", { name: "no_such" }, ctx());
    expect(outcome.ok).toBe(false);
    expect(outcome.text).toContain("emails_for_entities");
  });
});
