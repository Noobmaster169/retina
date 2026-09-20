import type { Transition, Variants } from "motion/react";

/**
 * The motion vocabulary of docs/05-design.md section 9, in one place so no
 * screen invents a duration. The system is still: nothing here loops, and every
 * one of these settles inside 320ms.
 */

/** Hover, press, a chip changing state. */
export const quick: Transition = { duration: 0.12, ease: "easeOut" };

/** A panel, a sheet or a popover opening. */
export const panel: Transition = { duration: 0.18, ease: [0.2, 0, 0, 1] };

/** The scrim behind an overlay. */
export const scrim: Transition = { duration: 0.2, ease: [0.2, 0, 0, 1] };

/**
 * The rail collapsing and a field row expanding. A spring rather than a curve
 * because both animate a width or a height a person is dragging their eye
 * across, and a spring lands without the overshoot a bezier of this length
 * gives you.
 */
export const spring: Transition = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 };

/** A row arriving in a live panel: 160ms, fade plus a 4px rise. */
export const rowEnter: Variants = {
  hidden: { opacity: 0, y: 4 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.16, ease: "easeOut" } },
  gone: { opacity: 0, transition: { duration: 0.12, ease: "easeOut" } },
};

/**
 * A list painting for the first time. 24ms apart, capped so a panel of forty
 * rows does not take a second to arrive; after the first paint rows animate
 * individually through `rowEnter`.
 */
export function stagger(index: number, step = 0.024, cap = 8): Transition {
  return { duration: 0.16, ease: "easeOut", delay: Math.min(index, cap) * step };
}

/** A number replacing another. It changes instantly and crossfades; it never counts up. */
export const swap: Transition = { duration: 0.14, ease: "easeOut" };
