import { describe, expect, it } from "vitest";

import { clamp, fitTo, HEIGHT, IDENTITY, laneWidth, MAX_SCALE, pan, projectionFor, toViewBox, WIDTH, zoomAround } from "./geometry";

describe("clamp", () => {
  it("never zooms out past the world or pans it off the viewBox", () => {
    expect(clamp({ k: 0.2, x: 50, y: 50 })).toEqual(IDENTITY);
    expect(clamp({ k: 2, x: 10, y: -5000 })).toEqual({ k: 2, x: 0, y: -HEIGHT });
    expect(clamp({ k: 100, x: 0, y: 0 }).k).toBe(MAX_SCALE);
  });
});

describe("zoomAround", () => {
  it("keeps the point under the pointer where it was", () => {
    const at: [number, number] = [300, 200];
    const before = { k: 2, x: -100, y: -50 };
    const after = zoomAround(before, 1.5, ...at);
    // The world point under (300, 200) before is ((300 + 100) / 2, (200 + 50) / 2) = (200, 125).
    expect((at[0] - after.x) / after.k).toBeCloseTo(200, 6);
    expect((at[1] - after.y) / after.k).toBeCloseTo(125, 6);
    expect(after.k).toBe(3);
  });

  it("stops at the scale limits", () => {
    expect(zoomAround(IDENTITY, 0.5, 0, 0)).toEqual(IDENTITY);
  });
});

describe("pan", () => {
  it("moves the view and stays clamped", () => {
    expect(pan({ k: 2, x: -100, y: -100 }, 30, -30)).toEqual({ k: 2, x: -70, y: -130 });
    expect(pan({ k: 2, x: -100, y: -100 }, 500, 0).x).toBe(0);
  });
});

describe("fitTo", () => {
  it("is the whole world for nothing", () => {
    expect(fitTo([])).toEqual(IDENTITY);
  });

  it("centres one point at the closest scale allowed", () => {
    const t = fitTo([[600, 100]], 40, 5);
    expect(t.k).toBe(5);
    expect(t.x + 600 * t.k).toBeCloseTo(WIDTH / 2, 6);
    expect(t.y + 100 * t.k).toBeCloseTo(HEIGHT / 2, 6);
  });

  it("frames a spread of points inside the viewBox with padding", () => {
    const points: [number, number][] = [
      [100, 100],
      [500, 300],
    ];
    const t = fitTo(points, 40, 5);
    for (const [px, py] of points) {
      const sx = px * t.k + t.x;
      const sy = py * t.k + t.y;
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(WIDTH);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sy).toBeLessThanOrEqual(HEIGHT);
    }
    expect(t.k).toBeGreaterThan(1);
  });
});

describe("toViewBox", () => {
  it("scales a client point by the rendered width", () => {
    expect(toViewBox({ left: 10, top: 20, width: 480 }, 250, 140)).toEqual([480, 240]);
  });
});

describe("laneWidth", () => {
  it("is thin for one shipment and four times that at the busiest", () => {
    expect(laneWidth(1, 0)).toBe(0.6);
    expect(laneWidth(100, 100)).toBeCloseTo(2.4, 6);
    expect(laneWidth(0, 100)).toBe(0.6);
  });
});

describe("projectionFor", () => {
  it("puts Singapore right of centre and near the equator", () => {
    const at = projectionFor()([103.8, 1.3]);
    expect(at).not.toBeNull();
    expect((at as [number, number])[0]).toBeGreaterThan(WIDTH / 2);
    expect(Math.abs((at as [number, number])[1] - HEIGHT / 2)).toBeLessThan(HEIGHT / 10);
  });
});
