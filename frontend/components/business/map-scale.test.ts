import { describe, expect, it } from "vitest";

import { located, radiusFor } from "./map-scale";

describe("radiusFor", () => {
  it("grows with the square root of the count, between 3 and 14", () => {
    expect(radiusFor(0, 100)).toBe(3);
    expect(radiusFor(100, 100)).toBe(14);
    expect(radiusFor(25, 100)).toBeCloseTo(3 + 11 * 0.5, 5);
  });
});

describe("located", () => {
  it("keeps only rows with a coordinate pair on the globe", () => {
    const rows = [
      { id: "1", name: "A", attributes: { lat: "1.5", lon: "103.8" } },
      { id: "2", name: "B", attributes: { lat: null, lon: "1" } },
      { id: "3", name: "C", attributes: { lat: "95", lon: "0" } },
      { id: "4", name: "D", attributes: { lat: "abc", lon: "0" } },
    ];
    expect(located(rows).map((row) => row.id)).toEqual(["1"]);
    expect(located(rows)[0].lat).toBe(1.5);
  });
});
