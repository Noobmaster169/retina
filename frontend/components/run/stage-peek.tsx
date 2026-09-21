"use client";

import Link from "next/link";
import { HoverCard } from "radix-ui";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import { panel } from "@/lib/motion";

import { ElapsedText } from "./elapsed";

/**
 * The emails a stage is holding right now, on the card for that stage.
 *
 * They used to be two panels of their own under the strip, which said the
 * same thing twice: a card counting eight busy slots, and a panel below it
 * listing the eight. Putting the list on the card it belongs to leaves one
 * place to look, and leaves the strip reading as a strip.
 *
 * A few and then a count. Every email of a stage is a list nobody reads on a
 * card that is meant to be glanced at; the first few say what kind of work is
 * in there, and the number says how much.
 *
 * A stage the run cannot name emails for does not open at all. An empty card
 * that reacts to a hover is a promise of something to look at, and there is
 * nothing to look at.
 */

export interface PeekRow {
  emailId: string;
  /** What this email is doing, or what it carries. One short phrase. */
  says: string;
  /**
   * When it started or when it joined the line, counted up on the page's own
   * clock.
   *
   * Kept from the panels this replaced, because it is the one thing on those
   * rows that a count could not say: a slot that has held one email for four
   * minutes is the difference between a queue working and a queue stuck.
   */
  since: string | null;
}

/** Past this the card is a list rather than a glance. */
const SHOWN = 5;

export function StagePeek({
  title,
  rows,
  total,
  runId,
  children,
}: {
  /** What this stage is doing to them: `Being sorted`, `Waiting to be checked`. */
  title: string;
  rows: PeekRow[];
  /** Everything the stage holds, which is usually more than the rows. */
  total: number;
  runId: string;
  children: ReactNode;
}) {
  if (rows.length === 0) return <>{children}</>;
  const hidden = Math.max(0, total - rows.length);

  return (
    <HoverCard.Root openDelay={120} closeDelay={80}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content side="bottom" align="start" sideOffset={8} collisionPadding={12} asChild>
          <motion.div
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={panel}
            className="z-50 w-[292px] rounded-lg border border-hairline bg-canvas p-2 shadow-overlay"
          >
            <div className="flex items-center gap-2 px-1.5 pb-1.5">
              <span className="text-caption font-medium text-ink-secondary">{title}</span>
              <span className="grow" />
              <span className="font-mono text-mono-sm tabular-nums text-ink-tertiary">{total}</span>
            </div>
            {rows.map((row) => (
              <Link
                key={row.emailId}
                href={`/runs/${runId}/emails/${row.emailId}`}
                className="flex items-center gap-2 rounded-sm px-1.5 py-1 transition-colors duration-150 hover:bg-active"
              >
                <span className="shrink-0 font-mono text-mono-sm text-ink">{row.emailId}</span>
                <span className="min-w-0 truncate text-caption text-ink-tertiary">{row.says}</span>
                <span className="grow" />
                <ElapsedText since={row.since} />
              </Link>
            ))}
            {hidden > 0 ? <p className="px-1.5 pt-1 text-caption text-ink-tertiary">and {hidden} more</p> : null}
          </motion.div>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

export { SHOWN };
