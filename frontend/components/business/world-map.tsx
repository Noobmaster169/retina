"use client";

import { geoNaturalEarth1, geoPath } from "d3-geo";
import Link from "next/link";
import { useMemo, useState } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";

import { radiusFor } from "./map-scale";

/**
 * A flat world in the product's own hairlines, with one pin per located port.
 * SVG rather than tiles: nothing is fetched from anyone, it prints, and it is
 * the same drawing in every browser. Natural Earth keeps the shapes honest
 * without stretching the poles the way Mercator does.
 */

export interface MapPin {
  id: string;
  name: string;
  lat: number;
  lon: number;
  count: number;
  href: string;
  loading: number;
  discharge: number;
  flag?: string | null;
}

const WIDTH = 960;
const HEIGHT = 480;
const SPHERE = { type: "Sphere" } as const;

export function WorldMap({ pins, focus }: { pins: MapPin[]; focus?: string }) {
  const [hover, setHover] = useState<MapPin | null>(null);
  const { land, projection, path } = useMemo(() => {
    const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], SPHERE);
    const topology = world as unknown as Topology<{ countries: GeometryCollection }>;
    const land = feature(topology, topology.objects.countries);
    return { land, projection, path: geoPath(projection) };
  }, []);
  const max = Math.max(1, ...pins.map((pin) => pin.count));

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-hairline bg-canvas">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full" role="img" aria-label={`${pins.length} located ports`}>
        <path d={path(SPHERE) ?? ""} className="fill-sunken" />
        <path d={path(land) ?? ""} className="fill-canvas stroke-hairline-strong" strokeWidth={0.6} />
        {pins.map((pin) => {
          const at = projection([pin.lon, pin.lat]);
          if (!at) return null;
          const r = radiusFor(pin.count, max);
          const both = pin.loading > 0 && pin.discharge > 0;
          return (
            <Link key={pin.id} href={pin.href} onMouseEnter={() => setHover(pin)} onMouseLeave={() => setHover(null)}>
              <circle
                cx={at[0]}
                cy={at[1]}
                r={r}
                className={`fill-kind-port ${focus === pin.id ? "opacity-100" : "opacity-70"} hover:opacity-100`}
              />
              {both ? <circle cx={at[0]} cy={at[1]} r={r + 2.5} className="fill-none stroke-kind-port" strokeWidth={1} /> : null}
            </Link>
          );
        })}
      </svg>
      {hover ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-hairline bg-canvas px-3 py-2 text-small shadow-overlay">
          <span className="block font-medium text-kind-port">{hover.flag ? `${hover.flag} ` : ""}{hover.name}</span>
          <span className="block text-caption text-ink-tertiary">
            {hover.loading} loading, {hover.discharge} discharge
          </span>
        </div>
      ) : null}
    </div>
  );
}
