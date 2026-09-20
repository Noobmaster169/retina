import { describe, expect, it } from "vitest";

import { buildDossier, type DossierInput, LIMITS, renderProfile } from "../../src/pipeline/ontology";

/**
 * Two promises are on trial. A dossier is the same size whatever the thing's
 * traffic, and a profile says which of its sentences came from our mail and
 * which from the model's own knowledge.
 */

const EMPTY: DossierInput = {
  kind: "party",
  canonical: "ROXCEL TRADING GMBH",
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

const many = <T>(count: number, make: (at: number) => T): T[] => Array.from({ length: count }, (_, at) => make(at));

describe("a dossier", () => {
  it("is the same size for a thing seen a million times as for one seen twice", () => {
    const small = buildDossier({ ...EMPTY, names: [{ value: "ROXCEL", seenCount: 2, joinedBy: "kept" }], emails: 2 });
    const huge = buildDossier({
      ...EMPTY,
      names: many(5000, (at) => ({ value: `ROXCEL ${at}`, seenCount: 1_000_000 - at, joinedBy: "judge" })),
      counterparties: many(900, (at) => ({ name: `PARTY ${at}`, kind: "party", emails: 900 - at })),
      quotes: many(40_000, (at) => `line ${at}`),
      emails: 1_000_000,
    });

    expect(huge.sections["what it is called"]).toHaveLength(LIMITS.names + 1);
    expect(huge.sections["seen with"]).toHaveLength(LIMITS.counterparties + 1);
    expect(huge.sections["lines it was read from"]).toHaveLength(LIMITS.quotes + 1);
    expect(Object.keys(huge.sections)).toEqual(Object.keys(small.sections));
  });

  it("says how many more there were rather than dropping them silently", () => {
    const dossier = buildDossier({ ...EMPTY, roles: many(LIMITS.roles + 5, (at) => ({ role: `role_${at}`, appearances: 100 - at, emails: 1 })) });
    expect((dossier.sections["how it appears"] as string[]).at(-1)).toBe("and 5 more");
  });

  it("keeps every row where there are fewer than the limit, with the counts beside them", () => {
    const dossier = buildDossier({
      ...EMPTY,
      roles: [
        { role: "consignee", appearances: 12, emails: 9 },
        { role: "notify_party", appearances: 3, emails: 3 },
      ],
      emails: 11,
      firstMailDate: "2026-01-15",
      lastMailDate: "2026-03-02",
    });
    expect(dossier.sections["how it appears"]).toEqual(["consignee: 12 times in 9 emails", "notify_party: 3 times in 3 emails"]);
    expect(dossier.sections["how much"]).toBe("11 emails, mail dated 2026-01-15 to 2026-03-02");
  });

  it("says plainly that no email states a date, rather than leaving the reader to guess", () => {
    expect(buildDossier({ ...EMPTY, emails: 4 }).sections["how much"]).toBe("4 emails, no email states a date");
  });

  it("cuts a quote that would crowd out the rest", () => {
    const dossier = buildDossier({ ...EMPTY, quotes: ["x".repeat(500)] });
    expect((dossier.sections["lines it was read from"] as string[])[0]).toHaveLength(203);
  });
});

const PROFILE = {
  summary: "A paper trading company. It receives cargo on nine of our shipments.",
  observed: "Seen as a consignee on 12 appearances across 9 emails.",
  general: "A European paper distributor.",
  generalConfidence: 0.6,
  unknowns: ["no address has ever been written with this name"],
};

describe("rendering a profile", () => {
  it("keeps what the mail shows and what the model knows in separate sections, and labels the second", () => {
    const { markdown } = renderProfile("party", "ROXCEL TRADING GMBH", ["ROXCEL"], PROFILE, { country: "Austria", city: null });

    expect(markdown).toContain("## What our mail shows");
    expect(markdown).toContain("## General knowledge, unverified (confidence 0.60)");
    expect(markdown).toContain("- country: Austria");
    // A null attribute is not a row: it says nothing and takes a line.
    expect(markdown).not.toContain("city");
    expect(markdown.indexOf("## What our mail shows")).toBeLessThan(markdown.indexOf("## General knowledge"));
  });

  it("leaves the general section out entirely when there is none", () => {
    const { markdown } = renderProfile("person", "Willy Situmorang", [], { ...PROFILE, general: null, generalConfidence: null }, {});
    expect(markdown).not.toContain("General knowledge");
    expect(markdown).toContain("## What our mail shows");
  });

  it("renders the same text twice for the same input, so an unchanged profile does not look changed", () => {
    const once = renderProfile("port", "NANTONG, CHINA", ["NANTONG"], PROFILE, { region: "Asia" });
    const twice = renderProfile("port", "NANTONG, CHINA", ["NANTONG"], PROFILE, { region: "Asia" });
    expect(once).toEqual(twice);
  });

  it("puts the name, the spellings, the prose and every attribute value in the search text", () => {
    const { searchText } = renderProfile("port", "NANTONG, CHINA", ["NANTONG"], PROFILE, { region: "Asia", locode: null });
    for (const word of ["NANTONG, CHINA", "NANTONG", "paper trading", "European paper distributor", "Asia"]) {
      expect(searchText).toContain(word);
    }
  });
});
