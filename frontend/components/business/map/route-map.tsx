import { geoInterpolate, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";

import { lane, SPHERE } from "./geometry";

const WIDTH = 300;
const HEIGHT = 120;
const PAD = 14;
/** Closest the view gets, so two ports on one coast still show the coast they share. */
const MAX_SCALE = 420;

export interface RouteEnd {
  name: string;
  lat: number;
  lon: number;
}

const topology = world as unknown as Topology<{ countries: GeometryCollection }>;
const land = feature(topology, topology.objects.countries);

/**
 * One shipment's lane on a small map: the port of loading, the port of
 * discharge and the great circle between them, framed to the two and
 * turned so the lane's middle is the map's middle, which keeps a Pacific
 * crossing whole instead of cut at the edge. A thumbnail, not a place to
 * explore: no labels, nothing moves, and the ports are named in the record
 * beside it. The loading end is hollow, the discharge end filled. The full
 * map is on the ports page.
 */
export function RouteMap({ from, to }: { from: RouteEnd; to: RouteEnd }) {
  const a: [number, number] = [from.lon, from.lat];
  const b: [number, number] = [to.lon, to.lat];
  const arc = lane(a, b);
  const [midLon] = geoInterpolate(a, b)(0.5);
  const projection = geoNaturalEarth1()
    .rotate([-midLon, 0])
    .fitExtent(
      [
        [PAD, PAD],
        [WIDTH - PAD, HEIGHT - PAD],
      ],
      arc,
    );
  if (projection.scale() > MAX_SCALE) {
    const centre = projection.invert?.([WIDTH / 2, HEIGHT / 2]);
    projection.scale(MAX_SCALE);
    if (centre) {
      const at = projection(centre);
      const [tx, ty] = projection.translate();
      if (at) projection.translate([tx + WIDTH / 2 - at[0], ty + HEIGHT / 2 - at[1]]);
    }
  }
  const path = geoPath(projection);
  const pol = projection(a);
  const pod = projection(b);
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full" role="img" aria-label={`${from.name} to ${to.name}`}>
      <rect width={WIDTH} height={HEIGHT} className="fill-kind-port-tint" />
      <path d={path(SPHERE) ?? ""} className="fill-kind-port-tint" />
      <path d={path(land) ?? ""} className="fill-canvas stroke-hairline-strong" strokeWidth={0.4} />
      <path d={path(arc) ?? ""} className="fill-none stroke-kind-port opacity-25" strokeWidth={3} strokeLinecap="round" />
      <path
        d={path(arc) ?? ""}
        className="lane-flow fill-none stroke-kind-port"
        strokeWidth={1.4}
        strokeLinecap="round"
        style={{ strokeDasharray: "4 4", "--lane-period": "8px" } as React.CSSProperties}
      />
      {pol ? <circle cx={pol[0]} cy={pol[1]} r={3.5} className="fill-canvas stroke-kind-port" strokeWidth={1.8} /> : null}
      {pod ? <circle cx={pod[0]} cy={pod[1]} r={4} className="fill-kind-port stroke-canvas" strokeWidth={1.2} /> : null}
    </svg>
  );
}
