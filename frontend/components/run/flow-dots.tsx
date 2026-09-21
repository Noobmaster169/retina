"use client";

import { useEffect, useState } from "react";

import type { FlowLayout } from "./flow-layout";
import { SLICE_TONE } from "./outcome-tones";

/**
 * Emails travelling the bands, one dot each.
 *
 * Only while the run is working. A dot in flight is this product's loading
 * indicator: it says the machine is moving and it says which way the work is
 * going, which is the one thing a strip of numbers could never show. The
 * moment both queues drain, the same dots would be decoration on a finished
 * fact, so they stop and the picture stands still. That is also the rule the
 * UX guidance gives for continuous motion: a loading indicator, never an
 * ornament.
 *
 * `prefers-reduced-motion` turns them off outright, and nothing about the
 * diagram depends on them: every number is written beside its node.
 */

/** Enough to read as a stream, few enough to count. 520 dots would be static. */
const MAX_IN_FLIGHT = 18;
/** One lap. Slow enough to follow a single dot with the eye. */
const SECONDS = 2.6;


export function FlowDots({ layout, running }: { layout: FlowLayout; running: boolean }) {
  const [allowed, setAllowed] = useState(false);

  // In an effect and not at first render, because the server has no media
  // query to read and a mismatch here would be a hydration error on a page
  // whose whole job is to be trusted.
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setAllowed(!query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  if (!running || !allowed || layout.links.length === 0) return null;

  // Dots are shared out by how much work each band carries, so the busiest
  // route is visibly the busiest and a band of five does not pulse as fast as
  // a band of three hundred.
  const total = layout.links.reduce((sum, link) => sum + link.count, 0);
  if (total === 0) return null;

  return (
    <g aria-hidden="true">
      {layout.links.flatMap((link) => {
        const dots = Math.max(1, Math.round((link.count / total) * MAX_IN_FLIGHT));
        return Array.from({ length: dots }, (_, at) => (
          <circle key={`${link.id}-${at}`} r={2.5} fill={SLICE_TONE[link.tone].bar} opacity={0.9}>
            <animateMotion
              dur={`${SECONDS}s`}
              repeatCount="indefinite"
              // Spread over the lap so they arrive as a stream and not as a volley.
              begin={`${((at / dots) * SECONDS).toFixed(2)}s`}
              keyPoints="0;1"
              keyTimes="0;1"
              calcMode="linear"
            >
              <mpath href={`#${link.id}`} />
            </animateMotion>
          </circle>
        ));
      })}
    </g>
  );
}

