import { describe, expect, it } from "vitest";

import { countsFor, grouped, ORGANISERS, priceOf, scopesFor } from "./inbox-scope";

/**
 * The form used to name 520 whatever the email server was actually serving.
 * These are the two inboxes there are: the organisers' set, and the 5,000.
 */

const labels = (choices: { label: string }[]) => choices.map((one) => one.label);
const values = (choices: { value: string }[]) => choices.map((one) => one.value);

describe("scopesFor", () => {
  it("names the whole inbox by what it holds", () => {
    expect(labels(scopesFor(ORGANISERS))).toContain("The whole inbox, 520");
    expect(labels(scopesFor(5000, false))).toContain("The whole inbox, 5,000");
  });

  it("offers the eval subsets only against the inbox their split was made from", () => {
    expect(values(scopesFor(ORGANISERS))).toEqual(["dev", "holdout", "all", "first"]);
    expect(values(scopesFor(5000, false))).toEqual(["all", "first"]);
  });

  it("says the whole inbox without a number before the server has answered", () => {
    expect(labels(scopesFor(null))).toContain("The whole inbox");
  });
});

describe("countsFor", () => {
  it("never offers to read more of an inbox than it holds", () => {
    for (const size of [520, 5000, 30]) {
      for (const choice of countsFor(size)) expect(Number(choice.value)).toBeLessThan(size);
    }
  });

  it("reaches the thousands for an inbox that has them, and stops short of it", () => {
    expect(values(countsFor(5000))).toContain("2000");
    expect(values(countsFor(520))).not.toContain("1000");
    expect(values(countsFor(520))).toContain("500");
  });

  it("groups a long number the way a person reads it", () => {
    expect(grouped(5000)).toBe("5,000");
    expect(labels(countsFor(5000))).toContain("1,000 emails");
  });
});

describe("priceOf", () => {
  /** The one full run there is a measurement for: 520 emails, 1,351 calls, $24.02, 11 minutes. */
  it("quotes the measured run back at its own size", () => {
    const said = priceOf(520);
    expect(said).toContain("1,351 model calls");
    expect(said).toContain("$24");
    expect(said).toContain("11 minutes");
  });

  it("scales to the big inbox, which is the number worth seeing before starting one", () => {
    const said = priceOf(5000);
    expect(said).toContain("12,990 model calls");
    expect(said).toContain("$231");
  });
});
