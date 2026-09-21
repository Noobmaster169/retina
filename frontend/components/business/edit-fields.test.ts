import { describe, expect, it } from "vitest";

import { changedAttributes, EDIT_FIELDS } from "./edit-fields";

describe("changedAttributes", () => {
  it("sends only what changed, and null for a field that was emptied", () => {
    expect(changedAttributes({ country: "Kenya", city: "Mombasa", kind: null }, { country: "Kenya", city: " ", kind: "port operator" })).toEqual({
      city: null,
      kind: "port operator",
    });
  });

  it("names fields for the two kinds that have pages", () => {
    expect(EDIT_FIELDS.port.map((f) => f.key)).toContain("lat");
    expect(EDIT_FIELDS.party.map((f) => f.key)).toContain("group");
  });
});
