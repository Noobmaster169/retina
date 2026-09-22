import { afterEach, describe, expect, it, vi } from "vitest";

import { checkRunPassword, RUN_PASSWORD_HEADER, runGateConfigured } from "@/lib/run-gate";

/**
 * The real phrase is `RUN_PASSWORD` and is not in this repository, so these
 * set one of their own. Reading the answer out of the environment at call time
 * is what makes that possible, and is also what lets the phrase be changed
 * without a deploy.
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

  /**
   * The gate fails closed. An earlier version defaulted to a phrase written in
   * the source, which published the password to anyone who could read the
   * repository; refusing everything is the failure worth having.
   */
  it("starts nothing at all when no phrase is configured", () => {
    vi.stubEnv("RUN_PASSWORD", "");
    expect(runGateConfigured()).toBe(false);
    expect(checkRunPassword("")).toBe(false);
    expect(checkRunPassword("anything")).toBe(false);
  });

  it("says a phrase is configured when one is", () => {
    vi.stubEnv("RUN_PASSWORD", PHRASE);
    expect(runGateConfigured()).toBe(true);
  });

  it("names the header the route reads it from", () => {
    expect(RUN_PASSWORD_HEADER).toBe("x-run-password");
  });
});
