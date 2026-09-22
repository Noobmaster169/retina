import { describe, expect, it } from "vitest";

import { checkRunPassword, RUN_PASSWORD_HEADER } from "@/lib/run-gate";

describe("the run password", () => {
  it("accepts the shared phrase", () => {
    expect(checkRunPassword("clanker")).toBe(true);
  });

  it("refuses everything else, including the near misses a keyboard produces", () => {
    for (const wrong of ["Clanker", "clanker ", " clanker", "clanke", "clankerr", "", "CLANKER"]) {
      expect(checkRunPassword(wrong)).toBe(false);
    }
  });

  it("refuses a request that sent no header at all", () => {
    expect(checkRunPassword(null)).toBe(false);
    expect(checkRunPassword(undefined)).toBe(false);
  });

  it("names the header the route reads it from", () => {
    expect(RUN_PASSWORD_HEADER).toBe("x-run-password");
  });
});
