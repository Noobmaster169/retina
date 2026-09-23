"use client";

import { useEffect, useRef } from "react";

import type { RunSummary } from "@/lib/api/runs-schemas";

/**
 * Sends a finished run to the scorer once, without waiting for anyone to ask.
 *
 * A tab that was open for the whole run should read the score in `What it
 * took` the moment the queues drain. A tab opened on an old unscored run
 * tries once on load. A refusal leaves the header's button as the retry.
 */
export function useAutoScore(
  run: RunSummary,
  submit: (force: boolean) => Promise<boolean>,
  pending: string | null,
): void {
  const tried = useRef(false);

  useEffect(() => {
    if (!run.processingDone) {
      tried.current = false;
      return;
    }
    if (run.status === "cancelled" || run.status === "failed") return;
    if (run.lastSubmission !== null) return;
    if (tried.current || pending === "submit") return;

    tried.current = true;
    void submit(false);
  }, [run.processingDone, run.status, run.lastSubmission, pending, submit]);
}
