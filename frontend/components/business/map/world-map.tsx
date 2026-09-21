"use client";

import { geoGraticule10, geoPath } from "d3-geo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";

import { HEIGHT, lane as laneGeometry, projectionFor, WIDTH } from "./geometry";
import { Land, Lanes, Pins } from "./map-layers";
import { MapControls, MapLegend } from "./map-controls";
import { MapPanel, MapTooltip } from "./map-panel";
import type { MapLane, MapPin, PlacedLane, PlacedPin } from "./types";
import { useMapView } from "./use-map-view";

export type { MapLane, MapPin } from "./types";

/**
 * A flat world in the product's own hairlines, one pin per located port and
 * one great-circle lane per pair the shipments state. SVG rather than tiles:
 * nothing is fetched from anyone, it prints, and it is the same drawing in
 * every browser.
 *
 * Wheel zooms about the pointer, drag pans, a pin picks a port into a panel
 * in the drawing's bottom-left corner, the legend above it in the top-left. At rest only the pins are drawn; hovering or picking a
 * port draws its lanes, flowing from loading to discharge, and dims the rest.
 * `visible` is the page's filter: a port outside it is not drawn until it is
 * the far end of a lit port's lane, and then only as a ghost, so a filter on
 * one region still shows where that region's ports ship. `focus` opens with
 * that port lit, its lanes framed and no panel, because the page it sits on
 * is that port's panel already.
 */
export function WorldMap({
  pins,
  lanes = [],
  focus,
  wheel = true,
  visible,
  className = "",
}: {
  pins: MapPin[];
  lanes?: MapLane[];
  focus?: string;
  /** False lets the wheel scroll the page; the buttons and a drag still move the map. */
  wheel?: boolean;
  /** Ids of the pins the page's filter kept. Undefined keeps every pin. */
  visible?: string[];
  className?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const view = useMapView(svg, wheel);
  const [hoverPin, setHoverPin] = useState<PlacedPin | null>(null);
  const [hoverLane, setHoverLane] = useState<PlacedLane | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Where the pointer is over the box, and whether that is far enough right
  // for the tooltip to sit on its left. Measured on the move, never in render.
  const [pointer, setPointer] = useState({ x: 0, y: 0, flip: false });
  // Taking the pointer at press time fires a leave on the pin under it, so
  // the pin a click means is the one that was hovered when the press began.
  const pressed = useRef<PlacedPin | null>(null);

  const { land, graticule, path } = useMemo(() => {
    const projection = projectionFor();
    const topology = world as unknown as Topology<{ countries: GeometryCollection }>;
    return { land: feature(topology, topology.objects.countries), graticule: geoGraticule10(), path: geoPath(projection) };
  }, []);

  const placed = useMemo(() => {
    const projection = projectionFor();
    const kept = visible ? new Set(visible) : null;
    const byId = new Map<string, PlacedPin>();
    for (const pin of pins) {
      const at = projection([pin.lon, pin.lat]);
      if (at) byId.set(pin.id, { ...pin, x: at[0], y: at[1], visible: kept === null || kept.has(pin.id) });
    }
    const drawn: PlacedLane[] = [];
    for (const one of lanes) {
      const pol = byId.get(one.polId);
      const pod = byId.get(one.podId);
      if (!pol || !pod) continue;
      const d = path(laneGeometry([pol.lon, pol.lat], [pod.lon, pod.lat]));
      if (d) drawn.push({ ...one, pol, pod, d });
    }
    return { pins: [...byId.values()], lanes: drawn };
  }, [pins, lanes, path, visible]);

  const maxCount = Math.max(1, ...placed.pins.map((pin) => pin.count));
  const maxLane = Math.max(1, ...placed.lanes.map((one) => one.count));
  const picked = selected ? (placed.pins.find((pin) => pin.id === selected) ?? null) : null;
  const lit = hoverPin?.id ?? picked?.id ?? focus ?? null;
  const litLanes = lit ? placed.lanes.filter((one) => one.polId === lit || one.podId === lit) : [];
  const litEnds = new Set(litLanes.flatMap((one) => [one.polId, one.podId]));
  const drawnPins = placed.pins.filter((pin) => pin.visible || litEnds.has(pin.id));
  const pickedLanes = picked ? placed.lanes.filter((one) => one.polId === picked.id || one.podId === picked.id) : [];

  const frameAround = useCallback(
    (pin: PlacedPin) => {
      const ends = placed.lanes.filter((one) => one.polId === pin.id || one.podId === pin.id).flatMap((one) => [one.pol, one.pod]);
      view.frame([pin, ...ends].map((p) => [p.x, p.y]));
    },
    [placed.lanes, view],
  );

  // The page's port opens framed with its lanes; a list opens on the world.
  const framedFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || framedFocus.current === focus) return;
    const pin = placed.pins.find((one) => one.id === focus);
    if (!pin) return;
    framedFocus.current = focus;
    frameAround(pin);
  }, [focus, placed.pins, frameAround]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { k, x, y } = view.transform;
  const pick = (pin: PlacedPin) => setSelected((held) => (held === pin.id ? null : pin.id));

  const sameCountry = picked ? placed.pins.filter((pin) => pin.id !== picked.id && !!pin.countryCode && pin.countryCode === picked.countryCode) : [];
  return (
    <div ref={box} className={`relative w-full overflow-hidden rounded-lg border border-hairline bg-canvas @container ${className}`}>
      <svg
        ref={svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={`block h-auto w-full touch-none select-none ${view.dragging ? "cursor-grabbing" : "cursor-grab"}`}
        role="img"
        aria-label={`${placed.pins.length} located ports and ${placed.lanes.length} lanes`}
        onPointerDown={(event) => {
          pressed.current = hoverPin;
          view.onPointerDown(event);
        }}
        onPointerMove={(event) => {
          view.onPointerMove(event);
          const rect = box.current?.getBoundingClientRect();
          if (rect) setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top, flip: event.clientX - rect.left > rect.width * 0.6 });
        }}
        onPointerUp={view.onPointerUp}
        onPointerCancel={view.onPointerUp}
        onClick={() => {
          // The SVG holds the pointer while it is down, so every click lands
          // here: on a pin it picks that pin, on the water it clears, and a
          // drag that ended here does neither.
          if (!view.wasClick()) return;
          if (pressed.current) pick(pressed.current);
          else setSelected(null);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          if (hoverPin) frameAround(hoverPin);
          else view.zoomIn();
        }}
      >
        <g
          transform={`translate(${x} ${y}) scale(${k})`}
          style={{ transition: view.dragging ? "none" : "transform 320ms cubic-bezier(0.2, 0, 0, 1)" }}
        >
          <Land path={path} land={land} k={k} />
          <path d={path(graticule) ?? ""} className="fill-none stroke-kind-port opacity-[0.08]" strokeWidth={0.5 / k} />
          <Lanes lanes={litLanes} max={maxLane} k={k} onHover={setHoverLane} />
          <Pins pins={drawnPins} max={maxCount} lit={lit} selected={picked?.id ?? focus ?? null} k={k} onHover={setHoverPin} onPick={pick} />
        </g>
      </svg>
      {!view.dragging ? (
        <MapTooltip at={pointer} flip={pointer.flip} pin={hoverPin} lane={hoverPin ? null : hoverLane} />
      ) : null}
      {picked ? (
        <MapPanel pin={picked} lanes={pickedLanes} country={sameCountry} onPick={(pin) => setSelected(pin.id)} onFrame={() => frameAround(picked)} onClose={() => setSelected(null)} />
      ) : null}
      <MapControls onIn={view.zoomIn} onOut={view.zoomOut} onReset={view.reset} />
      <MapLegend ports={drawnPins.filter((pin) => pin.visible).length} lanes={placed.lanes.length} />
    </div>
  );
}
