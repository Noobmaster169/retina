import { describe, expect, it } from "vitest";

import { type QueueReading, viewOf, type Wording } from "../../src/queues/queue-slots";

/**
 * The run page's slot rows. `read` talks to BullMQ and is covered by the route
 * tests; `viewOf` is the pure half and it is what decides whether a held queue
 * reads as held or as empty, which the trouble board turns on.
 */

const NOW = 1_700_000_000_000;

const words: Wording = {
  stepOf: (emailId) => (emailId === "email_001" ? "judging the seven fields" : undefined),
  filesOf: (emailId) => (emailId === "email_002" ? "two files, txt and pdf" : ""),
};

function reading(over: Partial<QueueReading> = {}): QueueReading {
  return { name: "compare", active: [], next: [], waiting: 0, failed: 0, heldForMs: null, readAt: NOW, ...over };
}

describe("viewOf", () => {
  it("says what the model is doing when a call is in flight", () => {
    const view = viewOf(
      reading({ active: [{ emailId: "email_001", addedAt: NOW - 9000, startedAt: NOW - 4000 }] }),
      4,
      NOW,
      words,
    );
    expect(view.slots).toEqual([
      {
        emailId: "email_001",
        step: "judging the seven fields",
        startedAt: new Date(NOW - 4000).toISOString(),
        elapsedMs: 4000,
      },
    ]);
  });

  it("says what the queue does when the job is between calls, never a stage name", () => {
    const view = viewOf(reading({ active: [{ emailId: "email_009", addedAt: NOW, startedAt: NOW }] }), 4, NOW, words);
    expect(view.slots[0].step).toBe("opening the attachments");
  });

  it("uses the first queue's own words for a job between calls", () => {
    const view = viewOf(
      reading({ name: "classify", active: [{ emailId: "email_009", addedAt: NOW, startedAt: NOW }] }),
      8,
      NOW,
      words,
    );
    expect(view.slots[0].step).toBe("reading the email");
  });

  it("leaves elapsed null for a job BullMQ recorded no start for", () => {
    const view = viewOf(
      reading({ active: [{ emailId: "email_001", addedAt: NOW - 1000, startedAt: undefined }] }),
      4,
      NOW,
      words,
    );
    expect(view.slots[0]).toMatchObject({ startedAt: null, elapsedMs: null });
  });

  it("counts the slots it can see, not what the counts claim", () => {
    const view = viewOf(
      reading({
        active: [
          { emailId: "email_001", addedAt: NOW, startedAt: NOW - 100 },
          { emailId: "email_002", addedAt: NOW, startedAt: NOW - 200 },
        ],
        waiting: 128,
      }),
      4,
      NOW,
      words,
    );
    expect(view).toMatchObject({ active: 2, waiting: 128, concurrency: 4 });
  });

  it("carries a held queue's retry as an instant, so a stale poll cannot skew the countdown", () => {
    const view = viewOf(reading({ heldForMs: 21_000, waiting: 128 }), 4, NOW, words);
    expect(view.heldUntil).toBe(new Date(NOW + 21_000).toISOString());
    expect(view.slots).toEqual([]);
  });

  it("measures the retry from when the queue was read, not from when the view was built", () => {
    const view = viewOf(reading({ heldForMs: 30_000, readAt: NOW - 4000 }), 4, NOW, words);
    expect(view.heldUntil).toBe(new Date(NOW + 26_000).toISOString());
  });

  it("is not held when the queue is merely idle", () => {
    expect(viewOf(reading(), 4, NOW, words).heldUntil).toBeNull();
  });

  it("says how each waiting email's attachments read, and how long it has waited", () => {
    const view = viewOf(
      reading({ next: [{ emailId: "email_002", addedAt: NOW - 41_000, startedAt: undefined }] }),
      4,
      NOW,
      words,
    );
    expect(view.next).toEqual([
      { emailId: "email_002", files: "two files, txt and pdf", queuedAt: new Date(NOW - 41_000).toISOString() },
    ]);
  });

  it("never reports a negative elapsed when a clock runs backwards", () => {
    const view = viewOf(
      reading({
        active: [{ emailId: "email_001", addedAt: NOW, startedAt: NOW + 5000 }],
        next: [{ emailId: "email_002", addedAt: NOW + 5000, startedAt: undefined }],
      }),
      4,
      NOW,
      words,
    );
    expect(view.slots[0].elapsedMs).toBe(0);
    expect(view.next[0].queuedAt).toBe(new Date(NOW + 5000).toISOString());
  });
});
