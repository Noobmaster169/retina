import { geoInterpolate, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";

import { lane, SPHERE } from "./geometry";

const WIDTH = 640;
const HEIGHT = 240;
const PAD = 36;
/** Closest the view gets, so two ports on one coast still show the coast they share. */
const MAX_SCALE = 900;

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
 * crossing whole instead of cut at the edge. Nothing moves the view: it is a
 * picture of where the cargo goes, not a place to explore. The full map is
 * on the ports page.
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
  const ends = [
    { key: "pol", label: "Loading", at: projection(a) },
    { key: "pod", label: "Discharge", at: projection(b) },
  ];
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full" role="img" aria-label={`${from.name} to ${to.name}`}>
      <rect width={WIDTH} height={HEIGHT} className="fill-kind-port-tint" />
      <path d={path(SPHERE) ?? ""} className="fill-kind-port-tint" />
      <path d={path(land) ?? ""} className="fill-canvas stroke-hairline-strong" strokeWidth={0.6} />
      <path d={path(arc) ?? ""} className="fill-none stroke-kind-port opacity-25" strokeWidth={4} strokeLinecap="round" />
      <path
        d={path(arc) ?? ""}
        className="lane-flow fill-none stroke-kind-port"
        strokeWidth={1.8}
        strokeLinecap="round"
        style={{ strokeDasharray: "6 6", "--lane-period": "12px" } as React.CSSProperties}
      />
      {ends.map(({ key, label, at }) =>
        at ? (
          <g key={key}>
            <circle cx={at[0]} cy={at[1]} r={key === "pol" ? 5 : 6} className={key === "pol" ? "fill-canvas stroke-kind-port" : "fill-kind-port stroke-canvas"} strokeWidth={2} />
            <text
              x={at[0]}
              y={at[1] - 11}
              textAnchor="middle"
              className="fill-ink-secondary stroke-canvas font-sans text-[11px] font-medium"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {label}
            </text>
          </g>
        ) : null,
      )}
    </svg>
  );
}
