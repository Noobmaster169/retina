import { childLogger } from "../lib/logger";

const log = childLogger({ module: "llm-slot" });

/** Runs `fn` once a slot is free. Slots are handed out in the order they were asked for. */
export interface LlmSlot {
  <T>(fn: () => Promise<T>): Promise<T>;
  /**
   * The most calls this process has ever had in flight at once.
   *
   * It is the cap's own evidence. The semaphore makes exceeding `max`
   * impossible by construction, but "impossible by construction" is a claim
   * about code, and the exit checklist asks for a reading. A peak that sits
   * below the cap through a whole burst is the other thing worth knowing: it
   * means something upstream, not this, is the limit.
   */
  peak(): number;
}

/**
 * An in-process semaphore: at most `max` model calls in flight from this
 * process, whichever queue they come from. One worker process, one cap.
 */
export function llmSlots(max: number): LlmSlot {
  let inFlight = 0;
  let peak = 0;
  const waiting: (() => void)[] = [];

  function took(): void {
    if (inFlight <= peak) return;
    peak = inFlight;
    // Only when it rises, so a burst logs a handful of lines and not one per call.
    log.info({ peak, max }, "model slots in flight");
  }

  const slot = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (inFlight >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else inFlight += 1;
    took();
    try {
      return await fn();
    } finally {
      // Hand the slot straight to the next caller, so the count never dips and lets a newcomer jump the line.
      const next = waiting.shift();
      if (next) next();
      else inFlight -= 1;
    }
  };

  return Object.assign(slot, { peak: () => peak });
}
