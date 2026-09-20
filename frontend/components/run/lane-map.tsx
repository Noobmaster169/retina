"use client";

import { motion } from "motion/react";

import { Panel, PanelHead } from "@/components/ui/panel";
import { Icon } from "@/components/ui/icons";
import { quick, stagger, swap } from "@/lib/motion";

import type { CardState, LaneMap, StageCard } from "./progress";

/**
 * How the work moves: two lanes left to right, because the code has two queues
 * and not one pipeline. A vertical workflow canvas was drawn and rejected in
 * review; the horizontal reading is the one that matches
 * queues/names.ts, and only a BL_COMPARISON crosses between the lanes.
 */

const CARD: Record<CardState, { border: string; tint: string; icon: string; bar: string; value: string }> = {
  idle: { border: "border-hairline", tint: "bg-active", icon: "text-ink-tertiary", bar: "bg-ink-faint", value: "text-ink" },
  live: { border: "border-signal-line", tint: "bg-signal-tint", icon: "text-signal", bar: "bg-signal", value: "text-ink" },
  held: { border: "border-differ-line", tint: "bg-differ-tint", icon: "text-differ", bar: "bg-differ", value: "text-ink" },
  warn: { border: "border-hairline", tint: "bg-differ-tint", icon: "text-differ", bar: "bg-differ", value: "text-ink" },
  done: { border: "border-hairline", tint: "bg-active", icon: "text-ink-tertiary", bar: "bg-ink-faint", value: "text-ink" },
};

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
        <div className="grid grid-cols-2 gap-8">
          <Lane title="Sort every email" queue="classify" concurrency={`${slots.classify} at once`} />
          <Lane title="Check the two documents" queue="compare" concurrency={`${slots.compare} at once`} />
        </div>

        <div className="mt-3 flex items-stretch">
          {map.cards.map((card, index) => (
            <div key={card.key} className="flex min-w-0 flex-1 items-center">
              <Card card={card} index={index} />
              {index < map.cards.length - 1 ? (
                <Arrow crossing={index === 2 ? map.crossing : null} />
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="flex h-[34px] items-center gap-2.5 rounded-md border border-hairline bg-surface px-3">
            <span className="text-small text-ink-secondary">Nothing to check, finished</span>
            <span className="font-mono text-mono-xs text-ink-tertiary">not_comparable</span>
            <span className="text-strong font-semibold">{map.notComparable}</span>
          </span>
        </div>
      </div>
    </Panel>
  );
}

function Lane({ title, queue, concurrency }: { title: string; queue: string; concurrency: string }) {
  return (
    <div className="flex h-7 items-center gap-2 rounded-md bg-sunken px-3">
      <span className="text-small font-medium text-ink-secondary">{title}</span>
      <span className="font-mono text-mono-xs text-ink-tertiary">{queue}</span>
      <span className="grow" />
      <span className="text-small text-ink-tertiary">{concurrency}</span>
    </div>
  );
}

function Card({ card, index }: { card: StageCard; index: number }) {
  const skin = CARD[card.state];
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={stagger(index)}
      className={`min-w-0 flex-1 rounded-lg border px-3 py-2.5 transition-colors duration-300 ${skin.border}`}
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm ${skin.tint}`}>
          <Icon name={card.icon} size={11} className={skin.icon} />
        </span>
        <span className="truncate text-small font-medium">{card.label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <motion.span
          key={card.value}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={swap}
          className={`whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] tabular-nums ${skin.value}`}
        >
          {card.value}
        </motion.span>
        <span className="min-w-0 truncate text-caption text-ink-tertiary">{card.unit}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-active">
        <motion.div
          className={`h-1 rounded-full ${skin.bar}`}
          initial={false}
          animate={{ width: `${card.pct}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}

/** The crossing between the two lanes, drawn on the one arrow that carries a count. */
function Arrow({ crossing }: { crossing: number | null }) {
  const live = crossing !== null && crossing > 0;
  return (
    <div className="flex w-[42px] shrink-0 flex-col items-center justify-center gap-1 px-1">
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
