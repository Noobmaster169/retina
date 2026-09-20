import { describe, expect, it } from "vitest";

import { generalAllowed } from "../../src/queues/refresh-profiles";
import { EntityKind } from "../../src/contracts";

/**
 * Whether a profile may carry what the model knows from training.
 *
 * Two rules and one exception, and the exception is the point: a person never
 * gets a `general` section under either setting, because what a model believes
 * about a named individual is not something this system stores. Checked as a
 * table over every kind so a kind added later has to decide.
 */

describe("generalAllowed", () => {
  it.each(EntityKind.options.filter((kind) => kind !== "person"))("allows it for a %s under mail+model", (kind) => {
    expect(generalAllowed(kind, "mail+model")).toBe(true);
  });

  it.each(EntityKind.options)("never allows it for a %s under mail", (kind) => {
    expect(generalAllowed(kind, "mail")).toBe(false);
  });

  it("never allows it for a person, whichever setting is in force", () => {
    expect(generalAllowed("person", "mail+model")).toBe(false);
    expect(generalAllowed("person", "mail")).toBe(false);
  });
});
