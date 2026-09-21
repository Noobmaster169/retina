"use client";

import { type HTMLMotionProps, motion } from "motion/react";
import { forwardRef } from "react";

import { Icon } from "@/components/ui/icons";
import { stagger } from "@/lib/motion";

import type { CardState, StageCard } from "./progress";

/** One stage of one queue: what it is, the number it holds, and how busy it is. */

const CARD: Record<CardState, { border: string; tint: string; icon: string; bar: string }> = {
  idle: { border: "border-hairline", tint: "bg-active", icon: "text-ink-tertiary", bar: "bg-ink-faint" },
  live: { border: "border-signal-line", tint: "bg-signal-tint", icon: "text-signal", bar: "bg-signal" },
  held: { border: "border-differ-line", tint: "bg-differ-tint", icon: "text-differ", bar: "bg-differ" },
  warn: { border: "border-hairline", tint: "bg-differ-tint", icon: "text-differ", bar: "bg-differ" },
  done: { border: "border-hairline", tint: "bg-active", icon: "text-ink-tertiary", bar: "bg-ink-faint" },
};

/**
 * Forwards its ref and spreads what it is given, because a card that can be
 * peeked at is the trigger for that card: Radix clones this element to hang
 * the hover card off it, and a component that swallowed the ref would leave
 * the card floating at the corner of the page.
 */
export const Card = forwardRef<HTMLDivElement, { card: StageCard; index: number } & HTMLMotionProps<"div">>(
  function Card({ card, index, className = "", ...rest }, ref) {
  const skin = CARD[card.state];
  const live = card.state === "live";
  return (
    <motion.div
      ref={ref}
      {...rest}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={stagger(index)}
      className={`flex h-[76px] min-w-0 flex-col rounded-lg border px-3 py-2.5 transition-colors duration-500 ${skin.border} ${className}`}
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
      {/*
        The number changes in place. It used to be keyed on its own value,
        which is a remount every time it changed: React dropped the element and
        inserted a new one at four-tenths opacity, so on a live run all six
        numbers dipped and recovered together every two seconds. That read as
        the panel flickering rather than as anything having happened.

        Nothing is lost by holding still. The digits are tabular, so they swap
        without moving, and the bar under them already says the stage is
        working.
      */}
      <span className="mt-1 whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] tabular-nums">{card.value}</span>
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
},
);


