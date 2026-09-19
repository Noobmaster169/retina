import { describe, expect, it } from "vitest";
import { z } from "zod";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import type { Prompt } from "../../src/agents/prompts/registry";
import { callStructured, extractJson } from "../../src/agents/structured";
import { TerminalError } from "../../src/lib/errors";
import { inRollback, seedRun } from "../db";

const Answer = z.object({ colour: z.enum(["red", "blue"]), confidence: z.number().min(0).max(1) });
const prompt: Prompt = { step: "colour", version: "v3", model: "sonnet", maxTokens: 100, text: "Pick a colour.\n{{schema}}" };

describe("extractJson", () => {
  it.each([
    ["a fenced json block after reasoning", 'It is red.\n```json\n{"colour":"red","confidence":0.9}\n```', { colour: "red", confidence: 0.9 }],
    ["a fence with no language", '```\n{"colour":"blue","confidence":1}\n```', { colour: "blue", confidence: 1 }],
    ["a bare object after prose", 'Thinking about {braces}.\n{"colour":"red","confidence":0.5}', { colour: "red", confidence: 0.5 }],
    ["only the object", '{"colour":"blue","confidence":0.2}', { colour: "blue", confidence: 0.2 }],
    ["a brace inside a string", '{"colour":"red","note":"a } in text","confidence":0.4}', { colour: "red", note: "a } in text", confidence: 0.4 }],
    ["the last fenced block when there are two", '```json\n{"colour":"red"}\n```\nOn reflection:\n```json\n{"colour":"blue","confidence":0.7}\n```', { colour: "blue", confidence: 0.7 }],
  ])("reads %s", (_name, text, expected) => {
    expect(extractJson(text)).toEqual(expected);
  });

  it.each([["no object at all", "I cannot decide."], ["braces that are not JSON", "{not json}"], ["an unclosed object", '{"colour":"red"']])(
    "gives undefined for %s",
    (_name, text) => {
      expect(extractJson(text)).toBeUndefined();
    },
  );
});

describe("callStructured", () => {
  it("puts the schema in the system message and the input in labelled sections", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const llm = new FakeLlmClient('{"colour":"red","confidence":0.8}');

      const result = await callStructured(
        { llm, pool: tx },
        { prompt, input: { subject: "A thing", attachments: ["a.txt", "b.txt"], empty: [] }, schema: Answer, project: "worker", runId: run.id },
      );

      expect(result).toEqual({ value: { colour: "red", confidence: 0.8 }, model: "fake/sonnet", promptVersion: "v3" });
      expect(llm.requests[0].system).toContain('"enum"');
      // The same schema goes to the provider as a constraint, not only into the prompt as a request.
      expect(llm.requests[0].outputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(llm.requests[0].outputSchema).not.toHaveProperty("$schema");
      expect(llm.requests[0].system).not.toContain("{{schema}}");
      expect(llm.requests[0].user).toBe("## subject\nA thing\n\n## attachments\n- a.txt\n- b.txt\n\n## empty\n(none)");
    });
  });

  it("shows the model its mistake once, and records both attempts", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const llm = new FakeLlmClient(['{"colour":"green","confidence":0.8}', '{"colour":"blue","confidence":0.6}']);

      const result = await callStructured({ llm, pool: tx }, { prompt, input: { subject: "x" }, schema: Answer, project: "worker", runId: run.id });

      expect(result.value.colour).toBe("blue");
      expect(llm.requests[1].user).toContain("## your previous answer");
      expect(llm.requests[1].user).toContain("colour:");

      const { rows } = await tx.query(
        "select attempt, ok, error, step, prompt_version, input_tokens, cost_usd from core.llm_calls where run_id = $1 order by attempt",
        [run.id],
      );
      expect(rows).toEqual([
        expect.objectContaining({ attempt: 1, ok: false, step: "colour", prompt_version: "v3", input_tokens: 100 }),
        expect.objectContaining({ attempt: 2, ok: true, error: null, cost_usd: "0.001" }),
      ]);
      expect(rows[0].error).toContain("colour");
    });
  });

  it("does not ask again when the answer was cut off: the same cap would cut it off again", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const llm = new FakeLlmClient({ text: '{"colour":"re', stopReason: "max_tokens" });

      await expect(
        callStructured({ llm, pool: tx }, { prompt, input: { subject: "x" }, schema: Answer, project: "worker", runId: run.id }),
      ).rejects.toThrow(/ran out of tokens/);
      expect(llm.requests).toHaveLength(1);
    });
  });

  it("gives up after the second bad answer with a terminal error", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const llm = new FakeLlmClient("no json here");

      await expect(
        callStructured({ llm, pool: tx }, { prompt, input: { subject: "x" }, schema: Answer, project: "worker", runId: run.id }),
      ).rejects.toBeInstanceOf(TerminalError);
      expect(llm.requests).toHaveLength(2);
    });
  });
});
