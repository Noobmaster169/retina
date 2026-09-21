"use client";

import { Fragment } from "react";
import { motion } from "motion/react";

import { Panel, PanelHead } from "@/components/ui/panel";
import { Icon } from "@/components/ui/icons";
import { stagger, swap } from "@/lib/motion";

import type { CardState, LaneMap, StageCard } from "./progress";
import { LanePipe } from "./lane-pipe";

/**
 * How the work moves: two queues, one row each, joined by the pipe the
 * crossing runs through.
 *
 * It was one row of six cards, which drew two queues as though they were one
 * pipeline and left the crossing as an arrow with a label that overhung the
 * card beside it. A row per queue is what the code actually has
 * (queues/names.ts), and it gives the crossing somewhere of its own to be.
 *
 * What this panel says is what the machine is doing. Where the work ended is
 * the flow diagram below, which names the same five outcomes and opens each
 * one's emails; saying them here too was one screen speaking twice.
 */

const CARD: Record<CardState, { border: string; tint: string; icon: string; bar: string }> = {
  idle: { border: "border-hairline", tint: "bg-active", icon: "text-ink-tertiary", bar: "bg-ink-faint" },
  live: { border: "border-signal-line", tint: "bg-signal-tint", icon: "text-signal", bar: "bg-signal" },
  held: { border: "border-differ-line", tint: "bg-differ-tint", icon: "text-differ", bar: "bg-differ" },
  warn: { border: "border-hairline", tint: "bg-differ-tint", icon: "text-differ", bar: "bg-differ" },
  done: { border: "border-hairline", tint: "bg-active", icon: "text-ink-tertiary", bar: "bg-ink-faint" },
};

/** Three cards and two arrows. The arrows are fixed; the cards share what is left. */
const COLUMNS = "minmax(0,1fr) 28px minmax(0,1fr) 28px minmax(0,1fr)";

interface LaneMapProps {
  map: LaneMap;
  /** The sentence under the title. It says what the two queues are doing right now. */
  note: string;
  /** How many slots each queue has, from the worker's own env rather than from a constant here. */
  slots: { classify: number; compare: number };
  /** Work is moving, so the pipe carries something. A drained run's pipe is still. */
  flowing: boolean;
}

export function LaneMapPanel({ map, note, slots, flowing }: LaneMapProps) {
  const sorting = map.cards.slice(0, 3);
  const checking = map.cards.slice(3);
  return (
    <Panel className="shrink-0">
      <PanelHead title="How the work moves" note={note} />
      <div className="px-4 pb-4">
        <Lane name="classify" says="Sorts every email" at={slots.classify} cards={sorting} from={0} />
        <LanePipe crossing={map.crossing} flowing={flowing && map.crossing > 0} />
        <Lane name="compare" says="Checks the two documents" at={slots.compare} cards={checking} from={3} />
      </div>
    </Panel>
  );
}

/** One queue: what it is, how wide it runs, and its three cards. */
function Lane({ name, says, at, cards, from }: { name: string; says: string; at: number; cards: StageCard[]; from: number }) {
  return (
    <div>
      <div className="flex items-center gap-2 pb-2">
        <span className="font-mono text-mono-xs text-ink-tertiary">{name}</span>
        <span className="text-small text-ink-secondary">{says}</span>
        <span className="grow" />
        <span className="text-small text-ink-tertiary">{at} at once</span>
      </div>
      <div className="grid items-stretch" style={{ gridTemplateColumns: COLUMNS }}>
        {cards.map((card, index) => (
          <Fragment key={card.key}>
            <Card card={card} index={from + index} />
            {index < cards.length - 1 ? <Arrow /> : null}
          </Fragment>
        ))}
      </div>
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
      className={`flex h-[76px] min-w-0 flex-col rounded-lg border px-3 py-2.5 transition-colors duration-500 ${skin.border}`}
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm transition-colors duration-500 ${skin.tint}`}>
          <Icon name={card.icon} size={11} className={`transition-colors duration-500 ${skin.icon}`} />
        </span>
        <span className="truncate text-small font-medium">{card.label}</span>
        <span className="grow" />
        {/* Only where it is news. A number that says it already gets no word after it. */}
        {card.unit ? <span className="shrink-0 truncate text-caption text-ink-tertiary">{card.unit}</span> : null}
      </div>
      <motion.span
        key={card.value}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        transition={swap}
        className="mt-1 whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] tabular-nums"
      >
        {card.value}
      </motion.span>
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

/** Between two cards of one queue. It carries nothing, so it is drawn as nothing but a direction. */
function Arrow() {
  return (
    <div className="flex w-[28px] shrink-0 items-center justify-center">
      <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true">
        <path
          d="M2 4 H19 M15.5 1.5 L19 4 L15.5 6.5"
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
