import { describe, expect, it } from "vitest";

import type { EntityRow } from "@/lib/api/ontology-schemas";

import { groupByCountry, sortKeyOf, sortRows } from "./sort";

function row(name: string, emails: number, country: string | null, code: string | null = null, lastSeen: string | null = null): EntityRow {
  return { id: name, type: "port", name, mentions: 0, sightings: 0, emails, names: 1, lastSeen, attributes: { country, countryCode: code }, summary: null, roles: {} };
}

const rows = [row("B", 2, "Kenya", "KE"), row("A", 5, null), row("C", 3, "Chile", "CL"), row("D", 1, "Kenya", null)];

describe("sortRows", () => {
  it("orders by country, then most emails, and puts things with no country last", () => {
    expect(sortRows(rows, "country").map((r) => r.name)).toEqual(["C", "B", "D", "A"]);
  });

  it("orders by emails by default", () => {
    expect(sortRows(rows, sortKeyOf("nonsense")).map((r) => r.name)).toEqual(["A", "C", "B", "D"]);
  });
});

describe("groupByCountry", () => {
  it("groups in country order, carrying the code from whichever row has it", () => {
    const groups = groupByCountry(rows);
    expect(groups.map((g) => [g.country, g.countryCode, g.rows.length])).toEqual([
      ["Chile", "CL", 1],
      ["Kenya", "KE", 2],
      [null, null, 1],
    ]);
  });
});
