/** Runs `fn` once a slot is free. Slots are handed out in the order they were asked for. */
export type LlmSlot = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * An in-process semaphore: at most `max` model calls in flight from this
 * process, whichever queue they come from. One worker process, one cap.
 */
export function llmSlots(max: number): LlmSlot {
  let inFlight = 0;
  const waiting: (() => void)[] = [];

  return async (fn) => {
    if (inFlight >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else inFlight += 1;
    try {
      return await fn();
    } finally {
      // Hand the slot straight to the next caller, so the count never dips and lets a newcomer jump the line.
      const next = waiting.shift();
      if (next) next();
      else inFlight -= 1;
    }
  };
}
