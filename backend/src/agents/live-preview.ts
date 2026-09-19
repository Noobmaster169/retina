import { childLogger } from "../lib/logger";
import type { LiveCalls } from "../live";

const log = childLogger({ module: "live-preview" });

/** A viewer polls about once a second; writing more often than this only loads Redis. */
const EVERY_MS = 250;

export interface PreviewOf {
  emailRunId: string;
  runId: string;
  step: string;
  model: string;
  promptVersion: string;
  attempt: number;
}

export interface LivePreview {
  onText(soFar: string): Promise<void>;
  /** The call is over, whichever way: the ledger row is the record from here on. */
  end(): Promise<void>;
}

/**
 * What a streaming call has written so far, kept where the run page can read it
 * while the call runs. A preview is a convenience: a write that fails is logged
 * and the model call carries on, because an email must never fail over it.
 */
export function livePreview(live: LiveCalls, of: PreviewOf, now: () => number = Date.now): LivePreview {
  const startedAt = new Date(now()).toISOString();
  let lastWrite = Number.NEGATIVE_INFINITY;
  const where = { runId: of.runId, emailRunId: of.emailRunId, stage: of.step };

  return {
    async onText(soFar) {
      if (now() - lastWrite < EVERY_MS) return;
      lastWrite = now();
      const { runId: _run, ...call } = of;
      try {
        await live.put({ ...call, text: soFar, startedAt, updatedAt: new Date(lastWrite).toISOString() });
      } catch (error) {
        log.warn({ ...where, err: error instanceof Error ? error.message : String(error) }, "live preview write failed");
      }
    },
    async end() {
      try {
        await live.clear(of.emailRunId);
      } catch (error) {
        log.warn({ ...where, err: error instanceof Error ? error.message : String(error) }, "live preview clear failed");
      }
    },
  };
}
