import type { RunQueuesView } from "@/lib/api/queues-schemas";

import type { PeekRow } from "./stage-peek";

/**
 * Which emails each stage card can name, and what to say about each.
 *
 * Only four of the six cards can name any. The queues report who holds a slot
 * and who is next in line, so `Classifying` and `Checking` can name the work
 * in hand and `Arriving` and `Waiting` the work in line. `Sorted` and
 * `Checked` are totals of emails that have moved on, and the run does not keep
 * a list of them here; those two cards stay closed rather than opening on
 * nothing.
 *
 * Pure: the queues in, four small lists out.
 */

export interface StagePeek {
  /** What this stage is doing to them, in the reader's words. */
  title: string;
  rows: PeekRow[];
  /** Everything the stage holds, which is usually more than the rows. */
  total: number;
}

/** A few say what kind of work is in there; the count says how much. */
const SHOWN = 5;

/** What a waiting email carries, or that nothing has been read off it yet. */
function waiting(files: string): string {
  return files === "" ? "just arrived" : files;
}

export function stagePeeks(queues: RunQueuesView): Record<string, StagePeek> {
  return {
    arriving: {
      title: "Waiting to be sorted",
      rows: queues.classify.next.slice(0, SHOWN).map((one) => ({ emailId: one.emailId, says: waiting(one.files), since: one.queuedAt })),
      total: queues.classify.waiting,
    },
    classifying: {
      title: "Being sorted now",
      rows: queues.classify.slots.slice(0, SHOWN).map((slot) => ({ emailId: slot.emailId, says: slot.step, since: slot.startedAt })),
      total: queues.classify.active,
    },
    waiting: {
      title: "Waiting to be checked",
      rows: queues.compare.next.slice(0, SHOWN).map((one) => ({ emailId: one.emailId, says: waiting(one.files), since: one.queuedAt })),
      total: queues.compare.waiting,
    },
    checking: {
      title: "Being checked now",
      rows: queues.compare.slots.slice(0, SHOWN).map((slot) => ({ emailId: slot.emailId, says: slot.step, since: slot.startedAt })),
      total: queues.compare.active,
    },
  };
}
