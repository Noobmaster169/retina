"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

import type { QueueName } from "@/lib/api/queues-schemas";

/**
 * A queue that a dependency has stopped. This is the empty state worth
 * designing: rather than four dashed boxes standing in for four busy slots,
 * the panel says what is held, when it retries, and hands the rest of its
 * space to the queue piling up behind it.
 *
 * It is amber and not red on purpose. failure-policy.ts rate limits the queue
 * and puts every held job back with its attempts untouched, so nothing has
 * failed and nothing has been spent. Red is for a job that gave up.
 */

const WHAT: Record<QueueName, string> = {
  classify: "Sorting is held",
  compare: "Checking is held",
};

export function HeldNotice({ until, queue }: { until: string; queue: QueueName }) {
  const seconds = useSecondsUntil(until);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
      role="status"
      className="mx-4 mt-0.5 rounded-lg border border-differ-line bg-differ-tint px-3 py-3"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-strong font-medium text-differ-ink">{WHAT[queue]}</span>
        <span className="grow" />
        <span className="font-mono text-micro text-differ">
          {seconds > 0 ? `retry in ${seconds}s` : "retrying now"}
        </span>
      </div>
      <p className="mt-1.5 text-small leading-[18px] text-differ-ink">
        The queue is rate limited for thirty seconds. Held jobs go back with their attempts untouched, so nothing is
        spent waiting.
      </p>
    </motion.div>
  );
}

/**
 * The retry counts down between polls rather than jumping every two seconds.
 * It is a clock and not a value that changed, so it is the one number on the
 * page allowed to move on its own.
 *
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
