"use client";

import { Fragment } from "react";
import { motion } from "motion/react";

import { Panel, PanelHead } from "@/components/ui/panel";
import { Icon } from "@/components/ui/icons";
import { quick, stagger, swap } from "@/lib/motion";

import type { CardState, LaneMap, StageCard } from "./progress";
import { Drop, Ends, NotComparable } from "./lane-ends";

/**
 * How the work moves: two lanes left to right, because the code has two queues
 * and not one pipeline. A vertical workflow canvas was drawn and rejected in
 * review; the horizontal reading is the one that matches queues/names.ts, and
 * only a BL_COMPARISON crosses between the lanes.
 *
 * Two cards have something below them, hung on a short drop rule: `Sorted`
 * carries what never needed a check, and `Checked` carries where the checked
 * pairs came out. Both sit in a second row whose columns line up with the
 * cards', so they stay under their own card at any width.
 */

const CARD: Record<CardState, { border: string; tint: string; icon: string; bar: string }> = {
  idle: { border: "border-hairline", tint: "bg-active", icon: "text-ink-tertiary", bar: "bg-ink-faint" },
  live: { border: "border-signal-line", tint: "bg-signal-tint", icon: "text-signal", bar: "bg-signal" },
  held: { border: "border-differ-line", tint: "bg-differ-tint", icon: "text-differ", bar: "bg-differ" },
  warn: { border: "border-hairline", tint: "bg-differ-tint", icon: "text-differ", bar: "bg-differ" },
  done: { border: "border-hairline", tint: "bg-active", icon: "text-ink-tertiary", bar: "bg-ink-faint" },
};

/** The card the first lane ends on, and so the one the crossing count sits after. */
const SORTED = 2;

/**
 * Eleven columns: six cards that share the width evenly, and five arrows at a
 * fixed size. The crossing arrow is wider than the rest because it carries a
 * label, and at the drawn 34px that label overhung the cards on both sides.
 *
 * The row under the cards uses the same template, so what hangs from a card
 * stays under it at every width. `minmax(0, 1fr)` is what lets a hung group be
 * wider than its column without widening the column, which is the bug that put
 * the last card off the panel when this was a flex row.
 */
const COLUMNS = "minmax(0,1fr) 34px minmax(0,1fr) 34px minmax(0,1fr) 86px minmax(0,1fr) 34px minmax(0,1fr) 34px minmax(0,1fr)";

interface LaneMapProps {
  map: LaneMap;
  /** The sentence under the title. It says what the two lanes are doing right now. */
  note: string;
  /** How many slots each queue has, from the worker's own env rather than from a constant here. */
  slots: { classify: number; compare: number };
}

export function LaneMapPanel({ map, note, slots }: LaneMapProps) {
  return (
    <Panel className="shrink-0">
      <PanelHead title="How the work moves" note={note} />
      <div className="px-4 pb-4">
        {/* The lanes span three card columns each, so each pill ends where its queue does. */}
        <div className="flex gap-[34px]">
          <Lane title="Sort every email" queue="classify" concurrency={`${slots.classify} at once`} />
          <Lane title="Check the two documents" queue="compare" concurrency={`${slots.compare} at once`} />
        </div>

        <div className="mt-3 grid items-stretch" style={{ gridTemplateColumns: COLUMNS }}>
          {map.cards.map((card, index) => (
            <Fragment key={card.key}>
              <Card card={card} index={index} />
              {index < map.cards.length - 1 ? <Arrow crossing={index === SORTED ? map.crossing : null} /> : null}
            </Fragment>
          ))}
        </div>

        {/* The same columns again: `Sorted` is the fifth, `Checked` the eleventh. */}
        <div className="grid items-start pt-0" style={{ gridTemplateColumns: COLUMNS }}>
          <div className="col-start-5 flex w-max flex-col items-center justify-self-center">
            <Drop />
            <NotComparable count={map.notComparable} />
          </div>
          <div className="col-start-11 flex w-max flex-col items-end justify-self-end">
            <Drop />
            <Ends ends={map.ends} />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Lane({ title, queue, concurrency }: { title: string; queue: string; concurrency: string }) {
  return (
    <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md bg-sunken px-3">
      <span className="shrink-0 text-small font-medium text-ink-secondary">{title}</span>
      <span className="shrink-0 font-mono text-mono-xs text-ink-tertiary">{queue}</span>
      <span className="grow" />
      <span className="shrink-0 text-small text-ink-tertiary">{concurrency}</span>
    </div>
  );
}

function Card({ card, index }: { card: StageCard; index: number }) {
  const skin = CARD[card.state];
  const live = card.state === "live";
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={stagger(index)}
      className={`flex h-[88px] min-w-0 flex-1 basis-0 flex-col rounded-lg border px-3 py-2.5 transition-colors duration-500 ${skin.border}`}
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm transition-colors duration-500 ${skin.tint}`}>
          <Icon name={card.icon} size={11} className={`transition-colors duration-500 ${skin.icon}`} />
        </span>
        <span className="truncate text-small font-medium">{card.label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <motion.span
          key={card.value}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={swap}
          className="whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] tabular-nums"
        >
          {card.value}
        </motion.span>
        <span className="min-w-0 truncate text-caption text-ink-tertiary">{card.unit}</span>
      </div>
      <span className="grow" />
      {/*
        Both bars stay mounted and cross-fade. Swapping one for the other
        unmounted the sweep, and a CSS animation restarts from its first frame
        every time its element is created: a card that flickered in and out of
        `live` for a moment left the loader frozen at the left edge.
      */}
      <div className="relative h-1 overflow-hidden rounded-full bg-active">
        <motion.span
          className={`absolute inset-y-0 left-0 rounded-full transition-opacity duration-300 ${skin.bar} ${live ? "opacity-0" : "opacity-100"}`}
          initial={false}
          animate={{ width: `${card.pct}%` }}
          transition={{ duration: 1.1, ease: [0.25, 0.8, 0.3, 1] }}
          aria-hidden="true"
        />
        {/* Every slot busy is not a fraction of anything finished, so a working
            stage sweeps rather than claiming a proportion it does not have. */}
        <span
          className={`sweep absolute inset-y-0 left-0 rounded-full transition-opacity duration-300 ${skin.bar} ${live ? "opacity-100" : "opacity-0"}`}
          aria-hidden="true"
        />
      </div>
    </motion.div>
  );
}

/**
 * The crossing between the two lanes. The one arrow that carries a count gets
 * a wider column than the rest: at the drawn 34px the label overhung the cards
 * on both sides of it and read as a collision rather than as a label.
 */
function Arrow({ crossing }: { crossing: number | null }) {
  const live = crossing !== null && crossing > 0;
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center gap-1 ${crossing === null ? "w-[34px]" : "w-[86px]"}`}
    >
      {crossing === null ? null : (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={quick}
          className={`whitespace-nowrap font-mono text-[9.5px] ${live ? "text-signal" : "text-ink-faint"}`}
        >
          {crossing} need a check
        </motion.span>
      )}
      <svg width="34" height="8" viewBox="0 0 34 8" aria-hidden="true" className="shrink-0">
        <path
          d="M3 4 H28 M24.5 1.5 L28 4 L24.5 6.5"
          fill="none"
          stroke={live ? "var(--signal)" : "var(--hairline-strong)"}
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
