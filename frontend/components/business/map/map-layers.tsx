"use client";

import type { GeoPath } from "d3-geo";

import { radiusFor } from "../map-scale";
import { laneWidth, SPHERE } from "./geometry";
import type { PlacedLane, PlacedPin } from "./types";

/**
 * The three drawings the map is made of, each a pure function of what it is
 * given and of which pin is lit. Widths are divided by the view's scale so a
 * hairline stays a hairline at any zoom, and a pin stays the size it means.
 */

export function Land({ path, land, k }: { path: GeoPath; land: GeoJSON.FeatureCollection | GeoJSON.Feature; k: number }) {
  return (
    <>
      <path d={path(SPHERE) ?? ""} className="fill-sunken" />
      <path d={path(land) ?? ""} className="fill-canvas stroke-hairline-strong" strokeWidth={0.6 / k} vectorEffect="non-scaling-stroke" />
    </>
  );
}

export function Lanes({
  lanes,
  max,
  lit,
  k,
  onHover,
}: {
  lanes: PlacedLane[];
  max: number;
  /** The id of the pin whose lanes are lit; null lights every lane. */
  lit: string | null;
  k: number;
  onHover(lane: PlacedLane | null): void;
}) {
  return (
    <g className="fill-none">
      {lanes.map((lane) => {
        // At rest every lane is faint so the pins read first; a lit lane is
        // the one thing on the map at full strength, and the rest step back.
        const tone = lit === null ? "opacity-35" : lane.polId === lit || lane.podId === lit ? "opacity-90" : "opacity-[0.06]";
        return (
          <path
            key={`${lane.polId}-${lane.podId}`}
            d={lane.d}
            strokeWidth={laneWidth(lane.count, max) / k}
            strokeLinecap="round"
            className={`stroke-kind-port transition-opacity duration-[120ms] ease-out ${tone}`}
            onPointerEnter={() => onHover(lane)}
            onPointerLeave={() => onHover(null)}
          />
        );
      })}
    </g>
  );
}

export function Pins({
  pins,
  max,
  lit,
  selected,
  k,
  onHover,
  onPick,
}: {
  pins: PlacedPin[];
  max: number;
  lit: string | null;
  selected: string | null;
  k: number;
  onHover(pin: PlacedPin | null): void;
  onPick(pin: PlacedPin): void;
}) {
  return (
    <g>
      {pins.map((pin) => {
        const r = radiusFor(pin.count, max) / k;
        const both = pin.loading > 0 && pin.discharge > 0;
        const on = lit === null || lit === pin.id;
        const here = selected === pin.id;
        return (
          <g
            key={pin.id}
            role="button"
            tabIndex={0}
            aria-label={`${pin.name}: ${pin.loading} loading, ${pin.discharge} discharge`}
            className={`cursor-pointer outline-none transition-opacity duration-[120ms] ease-out ${on ? "opacity-100" : "opacity-40"}`}
            onPointerEnter={() => onHover(pin)}
            onPointerLeave={() => onHover(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onPick(pin);
              }
            }}
          >
            {here ? <circle cx={pin.x} cy={pin.y} r={r + 6 / k} className="fill-none stroke-kind-port" strokeWidth={1 / k} strokeDasharray={`${2 / k} ${2 / k}`} /> : null}
            {both ? <circle cx={pin.x} cy={pin.y} r={r + 2.5 / k} className="fill-none stroke-kind-port" strokeWidth={1 / k} /> : null}
            <circle cx={pin.x} cy={pin.y} r={r} className={`fill-kind-port stroke-canvas ${here ? "opacity-100" : "opacity-80"}`} strokeWidth={1 / k} />
          </g>
        );
      })}
    </g>
  );
}
