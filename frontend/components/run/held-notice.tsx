"use client";

import { useEffect, useState } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import type { QueueName } from "@/lib/api/queues-schemas";

/**
 * A queue a dependency has stopped, said in the panel's header rather than in
 * its body. It was a block the size of four rows, which pushed the work the
 * panel is for off the screen to explain something that is usually over in
 * thirty seconds.
 *
 * "Rate limited" is BullMQ's word for it and it is a misleading one: nothing
 * here throttles throughput. `failure-policy.ts` catches a
 * `DependencyUnavailableError` and tells the queue to start nothing new for
 * thirty seconds, putting the job that hit it back with its attempts
 * untouched. It is a circuit breaker, and without it every job would spend its
 * three attempts within seconds of an outage and the run's emails would fail
 * for good. The chip says "paused" and the tooltip says the rest.
 *
 * Amber and not red: nothing has failed and nothing has been spent. Red is for
 * a job that gave up.
 */

const WHAT: Record<QueueName, string> = {
  classify: "Sorting",
  compare: "Checking",
};

interface HeldChipProps {
  until: string;
  queue: QueueName;
  /** Slots that took their job before the pause and are still working. */
  still: number;
}

export function HeldChip({ until, queue, still }: HeldChipProps) {
  const seconds = useSecondsUntil(until);
  return (
    <Tooltip
      label={
        <>
          <span className="block font-medium text-ink">{WHAT[queue]} is paused, not failing.</span>
          <span className="mt-1 block">
            A dependency refused, so the queue starts nothing new for thirty seconds and the job that hit it went back
            with its attempts untouched. Without that, every job would spend all three attempts within seconds of an
            outage and the run&apos;s emails would fail for good.
          </span>
          {still > 0 ? (
            <span className="mt-1 block">
              The {still === 1 ? "email" : `${still} emails`} below took a slot before the pause and{" "}
              {still === 1 ? "is" : "are"} still working.
            </span>
          ) : null}
        </>
      }
    >
      <span
        role="status"
        tabIndex={0}
        className="inline-flex h-[22px] shrink-0 cursor-default items-center gap-1.5 rounded-sm bg-differ-tint px-2 text-caption font-medium text-differ"
      >
        paused
        <span className="font-mono text-mono-xs tabular-nums">{seconds > 0 ? `${seconds}s` : "retrying"}</span>
      </span>
    </Tooltip>
  );
}

/**
 * The retry counts down between polls rather than jumping every two seconds.
 * The deadline is absolute, which is why the contract carries an instant: a
 * poll is already a second or two old by the time it is drawn, and counting
 * down from the duration it carried would be wrong by exactly that.
 */
function useSecondsUntil(deadline: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, []);
  const at = Date.parse(deadline);
  if (Number.isNaN(at)) return 0;
  return Math.max(0, Math.ceil((at - now) / 1000));
}
