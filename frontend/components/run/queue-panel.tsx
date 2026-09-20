"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { Panel, PanelFoot, PanelHead } from "@/components/ui/panel";
import { QueueView } from "@/lib/api/queues-schemas";
import { panel, rowEnter } from "@/lib/motion";

import { HeldNotice } from "./held-notice";

/**
 * One queue, one row per email holding a slot. A list is a list: the two
 * column grid of small boxes drawn for this panel was rejected in review, and
 * so was the grid of dashed placeholders that stood in for an empty one.
 *
 * When the queue is held, the rows are replaced rather than padded: the panel
 * says what is holding it and when it retries, and spends the rest of the
 * space on the queue piling up behind it.
 */

interface QueuePanelProps {
  title: string;
  queue: QueueView;
  runId: string;
  /** The sentence along the foot. What this queue's shape means, not what it is doing. */
  note: string;
  /** What to say when the queue has drained but the run is still going. */
  drained: string;
  /** How long a call of this kind usually takes, so the elapsed rule has a scale. */
  typicalMs: number;
  className?: string;
}

export function QueuePanel({ title, queue, runId, note, drained, typicalMs, className = "" }: QueuePanelProps) {
  const held = queue.heldUntil !== null;
  const empty = !held && queue.slots.length === 0 && queue.waiting === 0;
  return (
    <Panel className={`overflow-hidden ${className}`}>
      <PanelHead
        title={title}
        aside={
          <span className={`font-mono text-mono-sm ${held ? "text-differ" : "text-ink-tertiary"}`}>
            {queue.active} / {queue.concurrency}
          </span>
        }
      />

      <div className="flex min-h-0 grow flex-col overflow-y-auto">
      {held ? (
        <HeldNotice until={queue.heldUntil ?? ""} queue={queue.name} />
      ) : empty ? (
        // An empty panel is replaced, not padded. Four dashed slots standing in
        // for four busy ones was rejected in review: say what happened instead.
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={panel}
          className="mx-4 mt-0.5 max-w-[46ch] border-t border-hairline-faint pt-3 text-small leading-[18px] text-ink-tertiary"
        >
          {drained}
        </motion.p>
      ) : (
        <AnimatePresence initial={false} mode="popLayout">
          {queue.slots.map((slot) => (
            <motion.div
              key={slot.emailId}
              layout
              variants={rowEnter}
              initial="hidden"
              animate="shown"
              exit="gone"
              transition={panel}
            >
              <Link
                href={`/runs/${runId}/emails/${slot.emailId}`}
                className="relative flex h-[34px] items-center gap-2.5 border-t border-hairline-faint px-4 transition-colors duration-150 hover:bg-sunken"
              >
                <span className="w-[74px] shrink-0 font-mono text-mono-sm">{slot.emailId}</span>
                <span className="min-w-0 truncate text-small text-ink-secondary">{slot.step}</span>
                <span className="grow" />
                <span className="font-mono text-micro text-ink-tertiary">{elapsed(slot.elapsedMs)}</span>
                <Elapsed ms={slot.elapsedMs} typicalMs={typicalMs} />
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      )}

      {queue.next.length > 0 || queue.waiting > 0 ? (
        <>
          <div className="mt-2.5 flex h-[30px] shrink-0 items-center border-t border-hairline bg-surface px-4">
            <span className="text-caption font-medium text-ink-tertiary">Next in line</span>
            <span className="grow" />
            <span className={`text-caption ${held ? "text-differ" : "text-ink-tertiary"}`}>
              {queue.waiting} waiting{held ? ", climbing" : ""}
            </span>
          </div>
          {queue.next.map((waiting) => (
            <div key={waiting.emailId} className="flex h-[29px] shrink-0 items-center gap-2.5 px-4">
              <span className="w-[74px] shrink-0 font-mono text-mono-sm text-ink-faint">{waiting.emailId}</span>
              <span className="min-w-0 truncate text-small text-ink-faint">{waiting.files}</span>
              <span className="grow" />
              <span className="font-mono text-micro text-ink-faint">held {elapsed(waiting.heldMs)}</span>
            </div>
          ))}
        </>
      ) : null}
      <span className="grow" />
      </div>

      <PanelFoot>
        <p className="text-small leading-[18px] text-ink-tertiary">{note}</p>
      </PanelFoot>
    </Panel>
  );
}

/**
 * How long this email has held its slot, as a 2px rule along the bottom of the
 * row. Live is drawn structurally rather than with a pulse, so it survives a
 * screenshot: docs/05-design.md section 9.
 */
function Elapsed({ ms, typicalMs }: { ms: number | null; typicalMs: number }) {
  if (ms === null) return null;
  const pct = Math.min(100, (ms / typicalMs) * 100);
  return (
    <motion.span
      className="absolute bottom-0 left-0 h-0.5 bg-signal-line"
      initial={false}
      animate={{ width: `${pct}%` }}
      transition={{ duration: 0.4, ease: "linear" }}
      aria-hidden="true"
    />
  );
}

function elapsed(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}
