"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import type { LastSubmission } from "@/lib/api/runs-schemas";

import { framesFor, scrambleLike } from "./scramble";

/**
 * How the run scored.
 *
 * The organisers' number is the one worth looking at on a finished run, so it
 * takes the tile the cost used to fill. While the scorer is still working it
 * says so; once the answer is back it is the only figure in the panel that
 * opens on a hover, because a score nobody expected is worth a second look.
 */
export function ScoreReveal({
  scoring,
  submission,
}: {
  scoring: boolean;
  submission: LastSubmission | null;
}) {
  const [roll, setRoll] = useState(0);
  const scored = submission?.finalScore ?? null;
  const display = scored !== null ? scored.toFixed(4) : null;

  return (
    <div
      onMouseEnter={() => scored !== null && setRoll((at) => at + 1)}
      className="flex grow flex-col justify-center gap-1 rounded-lg border border-hairline bg-canvas px-3.5 py-3"
    >
      <span className="text-caption text-ink-tertiary">Score</span>
      {scoring ? (
        <span className="font-mono text-display-lg font-semibold tabular-nums text-ink-secondary">Scoring...</span>
      ) : display ? (
        <Rolling
          key={`score-${roll}`}
          value={display}
          run={roll > 0}
          className="font-mono text-display-lg font-semibold tabular-nums text-match"
        />
      ) : (
        <span className="font-mono text-display-lg font-semibold tabular-nums text-ink-faint">—</span>
      )}
    </div>
  );
}

/** How long one frame of the roll lasts. Eight of them is a glance, not a wait. */
const FRAME_MS = 45;

/**
 * A value that rolls its digits and settles left to right.
 *
 * It renders the settled value on the server and on the first paint, so a
 * reader who never points at it, or who has asked for less motion, sees the
 * number and nothing else. The roll is a browser effect over the top.
 */
function Rolling({ value, run, className }: { value: string; run: boolean; className: string }) {
  const [locked, setLocked] = useState<number | null>(run ? 0 : null);
  const still = useReducedMotion() ?? false;
  const frames = framesFor(value);

  useEffect(() => {
    if (!run || still) return;
    let at = 0;
    const tick = setInterval(() => {
      at += 1;
      if (at >= frames) {
        clearInterval(tick);
        setLocked(null);
        return;
      }
      setLocked(Math.floor((at / frames) * value.length));
    }, FRAME_MS);
    return () => clearInterval(tick);
  }, [run, still, frames, value.length]);

  const shown = still || locked === null ? value : scrambleLike(value, locked, Math.random);
  return <span className={className}>{shown}</span>;
}
