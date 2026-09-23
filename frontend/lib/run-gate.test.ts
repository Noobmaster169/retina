import { afterEach, describe, expect, it, vi } from "vitest";

import { checkRunPassword, DEFAULT_RUN_PASSWORD, RUN_PASSWORD_HEADER } from "@/lib/run-gate";

/**
 * Most of these set a phrase of their own through the environment, which works
 * because the answer is read at call time, which is also what lets the phrase
 * be changed without a deploy.
 */

const PHRASE = "a-phrase-only-this-test-uses";

afterEach(() => vi.unstubAllEnvs());

describe("the run password", () => {
  it("accepts the configured phrase", () => {
    vi.stubEnv("RUN_PASSWORD", PHRASE);
    expect(checkRunPassword(PHRASE)).toBe(true);
  });

  it("refuses the near misses a keyboard produces", () => {
    vi.stubEnv("RUN_PASSWORD", PHRASE);
    const wrong = [PHRASE.toUpperCase(), `${PHRASE} `, ` ${PHRASE}`, PHRASE.slice(0, -1), `${PHRASE}x`, ""];
    for (const candidate of wrong) expect(checkRunPassword(candidate)).toBe(false);
  });

  it("refuses a request that sent no header at all", () => {
    vi.stubEnv("RUN_PASSWORD", PHRASE);
    expect(checkRunPassword(null)).toBe(false);
    expect(checkRunPassword(undefined)).toBe(false);
  });

  it("falls back to the default phrase when none is configured", () => {
    vi.stubEnv("RUN_PASSWORD", "");
    expect(checkRunPassword(DEFAULT_RUN_PASSWORD)).toBe(true);
    expect(checkRunPassword("anything else")).toBe(false);
  });

  it("uses the configured phrase instead of the default when one is set", () => {
    vi.stubEnv("RUN_PASSWORD", PHRASE);
    expect(checkRunPassword(DEFAULT_RUN_PASSWORD)).toBe(false);
  });

  it("names the header the route reads it from", () => {
    expect(RUN_PASSWORD_HEADER).toBe("x-run-password");
  });
});
