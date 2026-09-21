import { describe, expect, it } from "vitest";

import { sectionsOf } from "./profile-sections";

const MD =
  "# ACME\nA party.\n\nA mill. A shipper on 4 emails.\n\n## What it is\n- country: X\n\n## What our mail shows\nObserved text.\n\n## General knowledge, unverified (confidence 0.80)\nGeneral text.";

describe("sectionsOf", () => {
  it("splits a profile into its summary and named sections", () => {
    const sections = sectionsOf(MD);
    expect(sections.summary).toBe("A mill. A shipper on 4 emails.");
    expect(sections.observed).toBe("Observed text.");
    expect(sections.general).toBe("General text.");
    expect(sections.generalConfidence).toBe("0.80");
  });

  it("is all nulls for nothing", () => {
    expect(sectionsOf(null)).toEqual({ summary: null, observed: null, general: null, generalConfidence: null });
  });
});
