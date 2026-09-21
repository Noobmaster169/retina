import { describe, expect, it } from "vitest";

import type { EntityKind } from "../../src/contracts";
import { buildInsight, type DossierInput, type InsightExtras, NO_EXTRAS } from "../../src/pipeline/ontology";

/**
 * Which three facts make a thing what it is. The fixtures are the shapes a
 * real dossier came back in for NHAVA SHEVA, VITAL SOLUTIONS and CMA, so a
 * change to the facet rules shows up here as a change of meaning rather than
 * as a diff of field names.
 */

const EMPTY: DossierInput = {
  kind: "port",
  canonical: "NHAVA SHEVA, INDIA (INNSA)",
  names: [],
  roles: [],
  counterparties: [],
  lanes: [],
  goods: [],
  addresses: [],
  quotes: [],
  emails: 0,
  firstMailDate: null,
  lastMailDate: null,
};

function insight(kind: EntityKind, dossier: Partial<DossierInput> = {}, extras: Partial<InsightExtras> = {}) {
  return buildInsight({
    kind,
    dossier: { ...EMPTY, kind, ...dossier },
    extras: { ...NO_EXTRAS, ...extras },
    markdown: null,
    attributes: {},
    attributeSources: {},
    spellings: 1,
  });
}

const headings = (kind: EntityKind, dossier: Partial<DossierInput> = {}, extras: Partial<InsightExtras> = {}) =>
  insight(kind, dossier, extras).facets.map((facet) => facet.heading);

const PORT_ROLES = [
  { role: "port_of_loading", appearances: 6, emails: 4 },
  { role: "port_of_discharge", appearances: 4, emails: 2 },
];
const LANES = [{ fromId: "1", from: "SINGAPORE", toId: "2", to: "MOMBASA, KENYA", emails: 3 }];
const PARTIES = [{ id: "7", name: "VITAL SOLUTIONS PTE LTD", kind: "party", emails: 2 }];

describe("which facets a kind gets", () => {
  it.each([
    ["a port is the end of a lane, the lanes, and who ships through it", "port" as const, ["Which end of the lane", "Lanes it sits on", "Who ships through it"]],
    ["a party is what they are to us, where they trade, what they handle", "party" as const, ["What they are to us", "Where they trade", "What they handle"]],
  ])("%s", (_name, kind, expected) => {
    expect(
      headings(kind, {
        roles: kind === "port" ? PORT_ROLES : [{ role: "consignee", appearances: 3, emails: 3 }],
        lanes: LANES,
        counterparties: PARTIES,
        goods: [{ description: "UNCOATED WOODFREE PAPER", emails: 2 }],
      }),
    ).toEqual(expected);
  });

  it("a carrier is its ships, its lanes and the numbers it issues", () => {
    expect(
      headings(
        "carrier",
        { lanes: LANES },
        {
          vessels: [{ id: "9", name: "MV ATLAS", emails: 2 }],
          references: [{ label: "bill of lading", value: "SIJ4216073" }],
        },
      ),
    ).toEqual(["Ships sailing under them", "Lanes served", "Numbers they issue"]);
  });

  it("a vessel is its voyages, whose line it sails for, and what it carried", () => {
    expect(
      headings(
        "vessel",
        { goods: [{ description: "CUPSTOCK", emails: 1 }] },
        { voyages: [{ voyage: "124E", lane: "SINGAPORE to MOMBASA", mailDate: "2026-01-27" }], carriers: [{ id: "3", name: "CMA", emails: 1 }] },
      ),
    ).toEqual(["Voyages we have seen", "Sailing for", "Cargo carried"]);
  });

  it("a commodity is its customs codes, its two sides and its lanes", () => {
    expect(
      headings("commodity", { counterparties: PARTIES, lanes: LANES }, { hsCodes: [{ code: "4805", emails: 3 }] }),
    ).toEqual(["Customs codes stated in the mail", "Who sells it and who buys it", "Where it goes"]);
  });

  it("a person is how we know them and who they work with", () => {
    expect(
      headings("person", {
        roles: [{ role: "sender", appearances: 4, emails: 4 }],
        counterparties: [{ id: "8", name: "LEE GUAN CHENG", kind: "person", emails: 2 }],
      }),
    ).toEqual(["How we know them", "Who they work with"]);
  });

  it("leaves a facet out rather than drawing an empty heading", () => {
    expect(headings("port")).toEqual([]);
  });
});

describe("what a facet says out loud", () => {
  it("reads one role as a relationship rather than as a count", () => {
    const facet = insight("party", { roles: [{ role: "consignee", appearances: 3, emails: 3 }] }).facets[0];
    expect(facet.note).toBe("Only ever consignee here, so far as our mail shows: it receives cargo.");
  });

  it("names the second role when there is one", () => {
    const facet = insight("port", { roles: PORT_ROLES }).facets[0];
    expect(facet.note).toBe("Most often port_of_loading, and port_of_discharge in 2 emails.");
  });

  it("points a lane at the port it leaves from", () => {
    const lanes = insight("port", { roles: PORT_ROLES, lanes: LANES }).facets[1];
    expect(lanes.lines[0]).toMatchObject({ label: "SINGAPORE", detail: "to MOMBASA, KENYA", target: { kind: "port", id: "1" } });
  });

  it("keeps a person's counterparties to people and companies", () => {
    const facet = insight("person", {
      roles: [{ role: "signer", appearances: 1, emails: 1 }],
      counterparties: [
        { id: "8", name: "LEE GUAN CHENG", kind: "person", emails: 2 },
        { id: "2", name: "MOMBASA, KENYA", kind: "port", emails: 2 },
      ],
    }).facets[1];
    expect(facet.lines.map((row) => row.label)).toEqual(["LEE GUAN CHENG"]);
  });
});

describe("the evidence facet", () => {
  const names = [
    { value: "NHAVA SHEVA, INDIA (INNSA)", seenCount: 6, joinedBy: "kept" },
    { value: "NHAVA SHEVA", seenCount: 2, joinedBy: "judge" },
  ];

  it("comes last, and says what may join two spellings", () => {
    const facets = insight("port", { roles: PORT_ROLES, names }).facets;
    const last = facets[facets.length - 1];
    expect(last.heading).toBe("Written these ways");
    expect(last.note).toContain("no edit distance");
  });

  it("is left out for a thing written one way, where there is nothing to explain", () => {
    expect(headings("port", { roles: PORT_ROLES, names: [names[0]] })).toEqual(["Which end of the lane"]);
  });
});

describe("identity", () => {
  it("marks what the model knows apart from what our mail shows", () => {
    const built = buildInsight({
      kind: "port",
      dossier: EMPTY,
      extras: NO_EXTRAS,
      markdown: null,
      attributes: { locode: "INNSA", region: "Asia", hsChapter: null },
      attributeSources: { locode: { source: "mail", confidence: null }, region: { source: "model", confidence: 0.98 } },
      spellings: 3,
    });
    expect(built.identity).toEqual([
      { key: "locode", label: "Locode", value: "INNSA", verified: true, confidence: null },
      { key: "region", label: "Region", value: "Asia", verified: false, confidence: 0.98 },
    ]);
  });

  it("writes a camelCase key as words", () => {
    const built = buildInsight({
      kind: "commodity",
      dossier: { ...EMPTY, kind: "commodity" },
      extras: NO_EXTRAS,
      markdown: null,
      attributes: { hsChapter: "48" },
      attributeSources: {},
      spellings: 1,
    });
    expect(built.identity[0].label).toBe("Hs chapter");
  });
});
