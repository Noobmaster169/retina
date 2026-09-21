import { describe, expect, it } from "vitest";

import { hrefFor, KINDS, kindOf } from "./kind";

describe("kinds", () => {
  it("routes the three business objects to their own pages and the rest to the ontology", () => {
    expect(hrefFor("party", "12")).toBe("/company/12");
    expect(hrefFor("port", "7")).toBe("/port/7");
    expect(hrefFor("shipment", "email_001")).toBe("/shipment/email_001");
    expect(hrefFor("vessel", "3")).toBeNull();
  });

  it("names every kind with a hue class and a plural", () => {
    for (const kind of Object.keys(KINDS)) {
      const entry = kindOf(kind);
      expect(entry.hue).toMatch(/^kind-/);
      expect(entry.plural.length).toBeGreaterThan(0);
    }
    expect(kindOf("party").label).toBe("Company");
  });
});
