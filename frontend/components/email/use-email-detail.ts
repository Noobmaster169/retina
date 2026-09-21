"use client";

import { useCallback } from "react";
import useSWR from "swr";

import type { Message } from "@/components/email/message-card";
import { Email } from "@/lib/api/mail-client";
import { EmailTrace } from "@/lib/api/trace-schemas";
import { parsedFetcher } from "@/lib/poll";

/**
 * One email, for the pane that reads it: the message as the sender sent it and
 * the trace as the run made it.
 *
 * Two reads, because they are two things. The seam the pane draws exists to
 * say which side of it a line came from, and one payload carrying both would
 * blur exactly what that seam is for.
 */

/** Still moving: worth a poll, because the next stage is about to change the pane. */
/** One email being watched through the pipeline. Its stage changes a handful of times in all. */
const MOVING_MS = 4000;
/** Parked: nothing changes until a person acts, and acting re-reads. A slow poll is for the other person. */
const OPEN_CASE_MS = 15_000;

interface EmailDetail {
  trace: EmailTrace | undefined;
  message: Message | undefined;
  subject: string;
  loading: boolean;
  /** Re-read both after a write, without waiting for the next poll. */
  reread: () => void;
}

export function useEmailDetail(runId: string, emailId: string | null): EmailDetail {
  const { data: trace, isLoading: traceLoading, mutate: rereadTrace } = useSWR(
    emailId ? `/api/runs/${runId}/emails/${emailId}/trace` : null,
    parsedFetcher(EmailTrace),
    { refreshInterval: (latest) => pollEvery(latest), keepPreviousData: false },
  );

  const { data: email, isLoading: mailLoading, mutate: rereadMail } = useSWR(
    emailId ? `/api/emails/${emailId}` : null,
    parsedFetcher(Email),
    { keepPreviousData: false },
  );

  const reread = useCallback(() => {
    void rereadTrace();
    void rereadMail();
  }, [rereadTrace, rereadMail]);

  const message = email
    ? { from: email.from, subject: email.subject, body: email.body, attachments: email.attachments }
    : undefined;

  return { trace, message, subject: email?.subject ?? "", loading: traceLoading || mailLoading, reread };
}

function pollEvery(trace: EmailTrace | undefined): number {
  if (!trace) return 0;
  if (!["done", "failed", "review"].includes(trace.stage)) return MOVING_MS;
  return trace.review?.status === "open" ? OPEN_CASE_MS : 0;
}
