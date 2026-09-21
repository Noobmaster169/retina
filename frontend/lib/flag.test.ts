import { describe, expect, it } from "vitest";

import { flagSrc } from "./flag";

describe("flagSrc", () => {
  it("points at the flag file for a code, whatever its case", () => {
    expect(flagSrc("SG")).toBe("/flags/SG.svg");
    expect(flagSrc("pk")).toBe("/flags/PK.svg");
  });

  it("is null for anything that is not a code with a flag", () => {
    expect(flagSrc(null)).toBeNull();
    expect(flagSrc("")).toBeNull();
    expect(flagSrc("Singapore")).toBeNull();
    expect(flagSrc("ZZ")).toBeNull();
  });
});
