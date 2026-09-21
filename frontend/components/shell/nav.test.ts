import { describe, expect, it } from "vitest";

import { activeFor, CLUSTERS, DESTINATIONS, hrefFor, runIdFrom } from "./nav";

const RUN = "0b8c2f2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

describe("activeFor", () => {
  it.each([
    ["/runs", ""],
    [`/runs/${RUN}`, "overview"],
    [`/runs/${RUN}/inbox`, "inbox"],
    [`/runs/${RUN}/emails/email_001`, "inbox"],
    // Both redirect into the inbox, so the rail names the inbox while they do.
    [`/runs/${RUN}/review`, "inbox"],
    [`/runs/${RUN}/ontology`, "ontology"],
    [`/runs/${RUN}/chat`, "chat"],
    [`/runs/${RUN}/database/port/3`, "database"],
    ["/clients", "clients"],
    ["/company", "company"],
    ["/company/12", "company"],
    ["/port/7", "port"],
    ["/shipment/email_001", "shipment"],
    ["/nowhere", ""],
  ])("%s is %s", (pathname, key) => {
    expect(activeFor(pathname)).toBe(key);
  });
});

describe("destinations", () => {
  it("no longer offers `Needs a person`, which is a chip on the inbox", () => {
    expect(DESTINATIONS.map((destination) => destination.key)).not.toContain("review");
  });
});

describe("runIdFrom", () => {
  it("reads the run out of a run route and nothing else", () => {
    expect(runIdFrom(`/runs/${RUN}/inbox`)).toBe(RUN);
    expect(runIdFrom("/runs")).toBeNull();
    expect(runIdFrom("/company/12")).toBeNull();
  });
});

describe("clusters", () => {
  it("puts every rail destination in exactly one cluster, business ones global", () => {
    for (const destination of DESTINATIONS) {
      expect(CLUSTERS.map((cluster) => cluster.key)).toContain(destination.cluster);
      if (destination.cluster === "business") expect(destination.global).toBe(true);
    }
    const company = DESTINATIONS.find((destination) => destination.key === "company");
    expect(company && hrefFor(company, null)).toBe("/company");
  });

  // A cluster says what a screen is about, not how it is addressed. Traffic is
  // an operations screen that no run scopes, so it must still lead to its own
  // path rather than to the run list the rest of that cluster falls back to.
  it("leads a global operations destination to its own path, with or without a run", () => {
    const gate = DESTINATIONS.find((destination) => destination.key === "gate");
    expect(gate?.cluster).toBe("operations");
    expect(gate && hrefFor(gate, null)).toBe("/gate");
    expect(gate && hrefFor(gate, "11111111-1111-1111-1111-111111111111")).toBe("/gate");
  });
});
