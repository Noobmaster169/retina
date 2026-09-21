import { geoNaturalEarth1, type GeoProjection } from "d3-geo";

/**
 * The map's arithmetic, apart from the drawing so it can be tested: where a
 * coordinate lands, what a great-circle lane is, and how the view moves.
 *
 * The view is one affine transform over the projected drawing, `k` a scale
 * and `x, y` a translation, applied to a group inside a fixed viewBox. Every
 * function here is pure over that triple.
 */

export const WIDTH = 960;
export const HEIGHT = 480;
export const MIN_SCALE = 1;
export const MAX_SCALE = 12;
export const SPHERE = { type: "Sphere" } as const;

export interface Transform {
  k: number;
  x: number;
  y: number;
}

export const IDENTITY: Transform = { k: 1, x: 0, y: 0 };

export function projectionFor(): GeoProjection {
  return geoNaturalEarth1().fitSize([WIDTH, HEIGHT], SPHERE);
}

/** A lane as geometry: a great circle between the two ports, which the path generator resamples under the projection. */
export function lane(from: [number, number], to: [number, number]): GeoJSON.LineString {
  return { type: "LineString", coordinates: [from, to] };
}

/** Keeps the drawing over the viewBox: never zoomed out past the whole world, never panned to show nothing. */
export function clamp(t: Transform): Transform {
  const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.k));
  const x = Math.min(0, Math.max(WIDTH - WIDTH * k, t.x));
  const y = Math.min(0, Math.max(HEIGHT - HEIGHT * k, t.y));
  return { k, x, y };
}

/** Scales by `factor` around a point in viewBox units, so what sits under the pointer stays under it. */
export function zoomAround(t: Transform, factor: number, cx: number, cy: number): Transform {
  const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.k * factor));
  const ratio = k / t.k;
  return clamp({ k, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio });
}

export function pan(t: Transform, dx: number, dy: number): Transform {
  return clamp({ ...t, x: t.x + dx, y: t.y + dy });
}

/**
 * The transform that frames a set of projected points with `pad` viewBox
 * units around them, no closer than `maxK`. One point is centred at `maxK`;
 * no point is the whole world.
 */
export function fitTo(points: [number, number][], pad = 40, maxK = 5): Transform {
  if (points.length === 0) return IDENTITY;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX + pad * 2);
  const spanY = Math.max(1, maxY - minY + pad * 2);
  const k = Math.min(maxK, MAX_SCALE, Math.max(MIN_SCALE, Math.min(WIDTH / spanX, HEIGHT / spanY)));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return clamp({ k, x: WIDTH / 2 - cx * k, y: HEIGHT / 2 - cy * k });
}

/** A client point on the rendered SVG in viewBox units. The SVG keeps its aspect, so one ratio serves both axes. */
export function toViewBox(rect: { left: number; top: number; width: number }, clientX: number, clientY: number): [number, number] {
  const ratio = WIDTH / rect.width;
  return [(clientX - rect.left) * ratio, (clientY - rect.top) * ratio];
}

/** Line width for a lane, in viewBox units, from its share of the busiest lane. Thin at one shipment, never a ribbon. */
export function laneWidth(count: number, max: number): number {
  if (max <= 0) return 0.6;
  return 0.6 + 1.8 * Math.sqrt(Math.max(0, count) / max);
}
