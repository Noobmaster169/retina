"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { Panel, PanelHead } from "@/components/ui/panel";
import { QueueView } from "@/lib/api/queues-schemas";
import { panel, rowEnter } from "@/lib/motion";

import { Elapsed, ElapsedText } from "./elapsed";

/**
 * One queue, one row per email holding a slot. A list is a list: the two
 * column grid of small boxes drawn for this panel was rejected in review, and
 * so was the grid of dashed placeholders that stood in for an empty one.
 *
 * When the queue is held or the run is paused, the rows are replaced rather
 * than padded: the panel says so in a sentence and spends the rest of the
 * space on the queue piling up behind it. No chip and no countdown along the
 * header: a hold is over in thirty seconds, and a badge that appeared and
 * vanished on that cycle was read as an alarm every time.
 */

interface QueuePanelProps {
  title: string;
  queue: QueueView;
  runId: string;
  /** True while the run is paused: the queue starts nothing new and says so rather than reading as drained. */
  paused: boolean;
  /** What to say when the queue has drained but the run is still going. */
  drained: string;
  className?: string;
}

export function QueuePanel({ title, queue, runId, paused, drained, className = "" }: QueuePanelProps) {
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
      {held && queue.slots.length === 0 ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={panel}
          className="mx-4 mt-0.5 max-w-[46ch] border-t border-hairline-faint pt-3 text-small leading-[18px] text-ink-tertiary"
        >
          Nothing is running. The queue starts nothing new until it retries, and what was waiting is still waiting.
        </motion.p>
      ) : paused ? (
        // Whatever the queue is doing underneath, a paused run shows no rows.
        // A parked job wakes every so often to ask whether the pause is over
        // and parks itself again, and each of those was a row appearing and
        // vanishing between two polls: the panel flickered for work nobody
        // was doing. Not drained either, and saying which is the difference
        // between a pause that worked and a run that quietly ended.
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={panel}
          className="mx-4 mt-0.5 max-w-[46ch] border-t border-hairline-faint pt-3 text-small leading-[18px] text-ink-tertiary"
        >
          Paused. Nothing is running here and nothing new is started until the run resumes; what was waiting is still
          waiting.
        </motion.p>
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
                <Elapsed since={slot.startedAt} />
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
              {queue.waiting} waiting{held ? ", climbing" : paused ? ", held for the resume" : ""}
            </span>
          </div>
          {queue.next.map((waiting) => (
            <div key={waiting.emailId} className="flex h-[29px] shrink-0 items-center gap-2.5 px-4">
              <span className="w-[74px] shrink-0 font-mono text-mono-sm text-ink-faint">{waiting.emailId}</span>
              <span className="min-w-0 truncate text-small text-ink-faint">{waiting.files}</span>
              <span className="grow" />
              <ElapsedText since={waiting.queuedAt} prefix="held " ticking={!paused} />
            </div>
          ))}
        </>
      ) : null}
      <span className="grow" />
      </div>

    </Panel>
  );
}
