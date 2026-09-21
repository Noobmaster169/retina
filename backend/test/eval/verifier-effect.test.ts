import { describe, expect, it } from "vitest";

import { verifierEffect } from "../../src/eval/verifier-effect";

describe("verifierEffect", () => {
  it.each([
    ["the verifier never ran", "SPAM", null, "SPAM", "not_run"],
    ["it never ran and the generator was wrong anyway", "GENERAL", null, "SPAM", "not_run"],
    ["it overturned a wrong generator onto the truth", "GENERAL", "SPAM", "SPAM", "fixed"],
    ["it overturned a right generator off the truth", "SPAM", "GENERAL", "SPAM", "broke"],
    ["it looked at a right answer and left it", "SPAM", "SPAM", "SPAM", "agreed_right"],
    ["it looked at a wrong answer and left it", "GENERAL", "GENERAL", "SPAM", "agreed_wrong"],
    ["it moved a wrong answer somewhere else wrong", "GENERAL", "INVOICE_QUERY", "SPAM", "changed_still_wrong"],
  ] as const)("%s", (_name, gen, ver, truth, expected) => {
    expect(verifierEffect(gen, ver, truth)).toBe(expected);
  });
});
