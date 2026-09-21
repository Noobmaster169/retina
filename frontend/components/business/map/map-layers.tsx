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
      <path d={path(SPHERE) ?? ""} className="fill-kind-port-tint stroke-hairline-strong" strokeWidth={0.8 / k} />
      <path d={path(land) ?? ""} className="fill-canvas stroke-hairline-strong" strokeWidth={0.5 / k} />
    </>
  );
}

/**
 * Only the lit port's lanes are drawn, and each one flows from the port of
 * loading to the port of discharge: the dashes travel the path's own
 * direction, so the motion is the direction of the cargo and not decoration.
 * `lane-flow` is in globals.css and stops under reduced motion.
 */
export function Lanes({ lanes, max, k, onHover }: { lanes: PlacedLane[]; max: number; k: number; onHover(lane: PlacedLane | null): void }) {
  return (
    <g className="fill-none">
      {lanes.map((lane) => (
        <path
          key={`${lane.polId}-${lane.podId}`}
          d={lane.d}
          strokeWidth={laneWidth(lane.count, max) / k}
          strokeLinecap="round"
          className="lane-flow stroke-kind-port opacity-90"
          style={{ strokeDasharray: `${5 / k} ${7 / k}`, "--lane-period": `${12 / k}px` } as React.CSSProperties}
          onPointerEnter={() => onHover(lane)}
          onPointerLeave={() => onHover(null)}
        />
      ))}
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
        const here = selected === pin.id;
        // A pin outside the filter is a ghost: drawn faint as the far end of
        // a lit lane and not otherwise. Everything else dims when one is lit.
        const on = pin.visible ? lit === null || lit === pin.id : false;
        const tone = pin.visible ? (on ? "opacity-100" : "opacity-40") : "opacity-45";
        return (
          <g
            key={pin.id}
            role="button"
            tabIndex={0}
            aria-label={`${pin.name}: ${pin.loading} loading, ${pin.discharge} discharge`}
            className={`cursor-pointer outline-none transition-opacity duration-[120ms] ease-out ${tone}`}
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
