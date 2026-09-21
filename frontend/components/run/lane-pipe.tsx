"use client";

import { motion } from "motion/react";

/**
 * The crossing between the two queues, as a pipe rather than an arrow.
 *
 * Only a comparison request crosses, so this is where a reader finds out how
 * much of the inbox the second queue ever sees. An arrow said that with a
 * label beside it, which is how the label came to sit on top of the card next
 * to it; a pipe says it by being somewhere, and the number sits inside the
 * bend where nothing else is drawn.
 *
 * The elbow is the shape of the two lanes: it leaves the last card of the
 * first row, drops, and runs back along to the first card of the second. That
 * is the journey, and drawing it straight would have meant putting the second
 * queue's first card under the first queue's last one, which reads right to
 * left.
 *
 * Emails travel it only while some are crossing. A still pipe on a drained
 * run is the honest picture of a drained run.
 */

const WIDTH = 1000;
const HEIGHT = 52;
/** Where the first row's last card is centred, and the second row's first. */
const FROM_X = 0.915;
const TO_X = 0.085;
const ELBOW = 10;

const PATH = `M ${WIDTH * FROM_X} 0
  V ${HEIGHT / 2 - ELBOW}
  q 0 ${ELBOW} ${-ELBOW} ${ELBOW}
  H ${WIDTH * TO_X + ELBOW}
  q ${-ELBOW} 0 ${-ELBOW} ${ELBOW}
  V ${HEIGHT}`;

/** Enough to read as a stream, few enough to count. */
const DOTS = 7;
const SECONDS = 3.2;

export function LanePipe({ crossing, flowing }: { crossing: number; flowing: boolean }) {
  return (
    <div className="relative h-[52px] w-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
        <path id="lane-pipe" d={PATH} fill="none" stroke="var(--hairline-strong)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {flowing ? (
          <g>
            {Array.from({ length: DOTS }, (_, at) => (
              <circle key={at} r={2.6} fill="var(--signal)">
                <animateMotion dur={`${SECONDS}s`} repeatCount="indefinite" begin={`${((at / DOTS) * SECONDS).toFixed(2)}s`}>
                  <mpath href="#lane-pipe" />
                </animateMotion>
              </circle>
            ))}
          </g>
        ) : null}
      </svg>

      {/*
        In HTML over the middle of the bend, not in the SVG. The pipe is
        stretched to the panel's width and anything drawn inside it stretches
        with it; text that stretches is text that has to be read at a size
        nobody chose.
      */}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-canvas px-2 text-caption"
      >
        <span className={`font-mono tabular-nums ${flowing ? "text-signal" : "text-ink-secondary"}`}>{crossing}</span>
        <span className="text-ink-tertiary"> cross</span>
      </motion.span>
    </div>
  );
}
