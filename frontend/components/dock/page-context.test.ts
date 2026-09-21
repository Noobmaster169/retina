import { describe, expect, it } from "vitest";

import { attached, keyOf, offered, type OfferedRef } from "./page-context";

const acme: OfferedRef = { kind: "party", id: "1", title: "ACME" };
const beta: OfferedRef = { kind: "port", id: "2", title: "BETA" };
const run: OfferedRef = { kind: "run", id: "r", title: "run r" };

describe("the context strip", () => {
  it("offers pinned refs first, then the page's, without repeating one", () => {
    expect(offered([acme, run], [beta, acme]).map(keyOf)).toEqual(["port:2", "party:1", "run:r"]);
  });

  it("attaches everything offered except what was switched off", () => {
    expect(attached([acme, run], [beta], ["run:r"]).map(keyOf)).toEqual(["port:2", "party:1"]);
  });

  it("caps what is sent at five, pinned winning", () => {
    const many = Array.from({ length: 6 }, (_, n) => ({ kind: "party" as const, id: String(n), title: `p${n}` }));
    expect(attached(many, [beta], [])).toHaveLength(5);
    expect(attached(many, [beta], [])[0]).toEqual(beta);
  });
});
