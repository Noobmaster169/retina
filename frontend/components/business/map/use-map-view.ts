"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { clamp, fitTo, IDENTITY, pan, toViewBox, type Transform, zoomAround } from "./geometry";

/**
 * The view over the drawing: wheel to zoom about the pointer, drag to pan,
 * and three moves a control can ask for. A move asked for glides; a drag
 * follows the hand with no easing, which is what makes it feel held.
 */

const WHEEL_STEP = 0.0015;
/** How far a press may travel and still count as a click on what was under it. */
const CLICK_SLOP = 4;

export interface MapView {
  transform: Transform;
  /** True while a pointer drags, so the drawing follows it without a transition. */
  dragging: boolean;
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
  frame(points: [number, number][]): void;
  onPointerDown(event: React.PointerEvent<SVGSVGElement>): void;
  onPointerMove(event: React.PointerEvent<SVGSVGElement>): void;
  onPointerUp(event: React.PointerEvent<SVGSVGElement>): void;
  /** Whether the pointer that just lifted stayed put since it went down. */
  wasClick(): boolean;
}

/** `wheel` false leaves the wheel to the page, for a map a person scrolls past rather than into. */
export function useMapView(svg: RefObject<SVGSVGElement | null>, wheel = true): MapView {
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [dragging, setDragging] = useState(false);
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // A wheel listener added by React is passive and cannot stop the page from
  // scrolling under the map, so it is attached by hand.
  useEffect(() => {
    const node = svg.current;
    if (!node || !wheel) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const [cx, cy] = toViewBox(node.getBoundingClientRect(), event.clientX, event.clientY);
      const factor = Math.exp(-event.deltaY * WHEEL_STEP);
      setTransform((t) => zoomAround(t, factor, cx, cy));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [svg, wheel]);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    press.current = { x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const held = press.current;
    if (!held) return;
    const dx = event.clientX - held.x;
    const dy = event.clientY - held.y;
    if (!held.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
    held.moved = true;
    setDragging(true);
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = 960 / rect.width;
    setTransform((t) => pan(t, dx * ratio, dy * ratio));
    held.x = event.clientX;
    held.y = event.clientY;
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  }, []);

  const wasClick = useCallback(() => {
    const held = press.current;
    press.current = null;
    return held !== null && !held.moved;
  }, []);

  const zoomIn = useCallback(() => setTransform((t) => zoomAround(t, 1.6, 480, 240)), []);
  const zoomOut = useCallback(() => setTransform((t) => zoomAround(t, 1 / 1.6, 480, 240)), []);
  const reset = useCallback(() => setTransform(IDENTITY), []);
  const frame = useCallback((points: [number, number][]) => setTransform(clamp(fitTo(points))), []);

  return { transform, dragging, zoomIn, zoomOut, reset, frame, onPointerDown, onPointerMove, onPointerUp, wasClick };
}
