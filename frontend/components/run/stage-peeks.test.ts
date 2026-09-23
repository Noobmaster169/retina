import { describe, expect, it } from "vitest";

import type { RunQueuesView } from "@/lib/api/queues-schemas";

import { stagePeeks } from "./stage-peeks";

const EMPTY = { concurrency: 10, waiting: 0, active: 0, failed: 0, heldUntil: null, slots: [], next: [] };
const STAGES = { classifying: 0, comparing: 0 };

function queues(over: Partial<RunQueuesView> = {}): RunQueuesView {
  return {
    classify: { name: "classify", ...EMPTY },
    compare: { name: "compare", ...EMPTY },
    handoff: { needCheck: 0, notComparable: 0, awaitingDraft: 0 },
    reachable: true,
    ...over,
  } as RunQueuesView;
}

describe("stagePeeks", () => {
  it("names the work in hand from the slots, in the model's own words", () => {
    const peeks = stagePeeks(
      queues({
        classify: {
          name: "classify",
          ...EMPTY,
          active: 2,
          slots: [
            { emailId: "email_1", step: "reading the subject", startedAt: null, elapsedMs: null },
            { emailId: "email_2", step: "weighing two categories", startedAt: null, elapsedMs: null },
          ],
        },
      }),
      STAGES,
    );
    expect(peeks.classifying.rows).toEqual([
      { emailId: "email_1", says: "reading the subject", since: null },
      { emailId: "email_2", says: "weighing two categories", since: null },
    ]);
    expect(peeks.classifying.total).toBe(2);
  });

  it("names the work in line from what is next, and says what it carries", () => {
    const peeks = stagePeeks(
      queues({
        compare: {
          name: "compare",
          ...EMPTY,
          waiting: 31,
          next: [{ emailId: "email_9", files: "two files, txt and pdf", queuedAt: "2026-09-22T00:00:00Z" }],
        },
      }),
      STAGES,
    );
    // The instant it joined the line is carried through, because the card
    // counts up from it and a count cannot say how long something has waited.
    expect(peeks.waiting.rows).toEqual([
      { emailId: "email_9", says: "two files, txt and pdf", since: "2026-09-22T00:00:00Z" },
    ]);
    // The rows are a glance and the total is the truth: 1 of 31.
    expect(peeks.waiting.total).toBe(31);
  });

  it("says an email has just arrived rather than leaving the line blank", () => {
    const peeks = stagePeeks(
      queues({ classify: { name: "classify", ...EMPTY, waiting: 1, next: [{ emailId: "email_3", files: "", queuedAt: "x" }] } }),
      STAGES,
    );
    expect(peeks.arriving.rows).toEqual([{ emailId: "email_3", says: "just arrived", since: "x" }]);
  });

  it("shows five and leaves the rest to the count, whatever the queue hands over", () => {
    const next = Array.from({ length: 9 }, (_, at) => ({ emailId: `email_${at}`, files: "one file", queuedAt: "x" }));
    const peeks = stagePeeks(queues({ classify: { name: "classify", ...EMPTY, waiting: 200, next } }), STAGES);
    expect(peeks.arriving.rows).toHaveLength(5);
    expect(peeks.arriving.total).toBe(200);
  });

  it("gives the two totals no list, because the run keeps none for them", () => {
    expect(Object.keys(stagePeeks(queues(), STAGES))).toEqual(["arriving", "classifying", "waiting", "checking"]);
  });

  it("is empty on a drained queue, so those cards do not open on nothing", () => {
    const peeks = stagePeeks(queues(), STAGES);
    expect(peeks.classifying.rows).toEqual([]);
    expect(peeks.waiting.rows).toEqual([]);
  });
});
