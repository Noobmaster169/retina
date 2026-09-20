import { describe, expect, it } from "vitest";
import { z } from "zod";

import { toOutputSchema } from "../../src/agents/structured";

/**
 * The provider refuses a union at the top level of a tool schema, and says so
 * as a 502 from the proxy marked retryable: the caller then retries a call
 * that can never succeed, three layers away from the schema that caused it.
 * This is that failure moved to the seam, as one sentence naming the fix.
 */

describe("toOutputSchema", () => {
  it("refuses a top-level union, because the provider will and this says why", () => {
    const union = z.discriminatedUnion("action", [
      z.object({ action: z.literal("tool"), tool: z.string() }),
      z.object({ action: z.literal("final"), answer: z.string() }),
    ]);
    expect(() => toOutputSchema(union)).toThrow(/cannot be a union/);
    expect(() => toOutputSchema(union)).toThrow(/narrow it after it parses/);
  });

  it("refuses a bare union too, not only a discriminated one", () => {
    const either = z.union([z.object({ a: z.string() }), z.object({ b: z.string() })]);
    expect(() => toOutputSchema(either)).toThrow(/cannot be a union/);
  });

  it("leaves a plain object schema exactly as it was", () => {
    const schema = toOutputSchema(z.object({ category: z.string(), confidence: z.number() }));
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["category", "confidence"]);
  });

  it("drops the dialect marker some providers reject", () => {
    expect(toOutputSchema(z.object({ a: z.string() }))).not.toHaveProperty("$schema");
  });
});
