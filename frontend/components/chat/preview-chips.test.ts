import { describe, expect, it } from "vitest";

import { previewChips } from "./preview-chips";

describe("previewChips", () => {
  const cases: { name: string; kind: string; attributes: Record<string, string | null>; want: string[] }[] = [
    { name: "a port leads with its code", kind: "port", attributes: { locode: "SGSIN", country: "Singapore", subregion: "South-eastern Asia" }, want: ["SGSIN", "Singapore", "South-eastern Asia"] },
    { name: "a company says what it does and where", kind: "party", attributes: { kind: "mill", city: "Graz", country: "Austria" }, want: ["mill", "Graz", "Austria"] },
    { name: "an unset attribute is left out rather than drawn empty", kind: "party", attributes: { kind: "converter", city: null, country: "Italy" }, want: ["converter", "Italy"] },
    { name: "an empty string counts as unset", kind: "vessel", attributes: { operator: "" }, want: [] },
    { name: "a thing with no profile yet has no chips", kind: "port", attributes: {}, want: [] },
    { name: "a fourth value would wrap, so it is dropped", kind: "carrier", attributes: { scac: "MAEU", fullName: "Maersk Line", kind: "ocean carrier" }, want: ["MAEU", "Maersk Line", "ocean carrier"] },
    { name: "a kind with no card attributes draws none", kind: "shipment", attributes: { reference: "BL-1" }, want: [] },
  ];

  for (const one of cases) {
    it(one.name, () => expect(previewChips(one.kind, one.attributes)).toEqual(one.want));
  }
});
