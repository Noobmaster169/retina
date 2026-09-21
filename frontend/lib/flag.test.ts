import { describe, expect, it } from "vitest";

import { flagOf } from "./flag";

describe("flagOf", () => {
  it("builds a flag from a two-letter code, whatever its case", () => {
    expect(flagOf("SG")).toBe("\u{1F1F8}\u{1F1EC}");
    expect(flagOf("pk")).toBe("\u{1F1F5}\u{1F1F0}");
  });

  it("is null for anything that is not a code", () => {
    expect(flagOf(null)).toBeNull();
    expect(flagOf("")).toBeNull();
    expect(flagOf("Singapore")).toBeNull();
    expect(flagOf("S1")).toBeNull();
  });
});
