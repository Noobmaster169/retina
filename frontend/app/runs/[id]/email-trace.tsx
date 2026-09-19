"use client";

import Link from "next/link";
import useSWR from "swr";

import { EmailTrace as EmailTraceSchema } from "@/lib/api/trace-schemas";
import { parsedFetcher } from "@/lib/poll";

import { CallCard } from "./call-card";
import { DocumentsPanel } from "./documents-panel";
import { StreamingText } from "./streaming-text";
import { VerdictPanel } from "./verdict-panel";

/** Fast while the email is being worked on, so its answer can be watched as it is written. */
const WORKING_POLL_MS = 1000;
const IDLE_POLL_MS = 5000;
const fetchTrace = parsedFetcher(EmailTraceSchema);

interface Props {
  runId: string;
  emailId: string | null;
  /** False once the run is finished: a finished email cannot change. */
  live: boolean;
}

/** One email: the verdict, the call being written right now, and every call made for it in order. */
export function EmailTrace({ runId, emailId, live }: Props) {
  const { data, error } = useSWR(emailId ? `/api/runs/${runId}/emails/${emailId}/trace` : null, fetchTrace, {
    refreshInterval: (latest) =>
      !live ? 0 : latest?.live || latest?.stage === "classifying" || latest?.stage === "comparing" ? WORKING_POLL_MS : IDLE_POLL_MS,
  });

  if (!emailId) {
    return (
      <section className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">
        Pick an email, here or under Working now, to see its verdict, what the model is writing as it writes it, and every
        call made for it: the exact input, the answer, and the final JSON.
      </section>
    );
  }

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-mono text-base font-semibold">{emailId}</h2>
        {data && <span className="text-sm text-muted">{data.stage}</span>}
        <Link href={`/mail/${emailId}`} className="text-sm text-muted hover:text-accent-ink">
          open the email
        </Link>
      </div>
      {error instanceof Error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error.message}
        </p>
      )}
      {data?.error && <p className="mt-2 text-sm text-red-700">{data.error}</p>}
      <div className="mt-3 flex flex-col gap-3">
        {data?.classification && <VerdictPanel classification={data.classification} />}
        {data && <DocumentsPanel documents={data.documents} review={data.review} />}
        {data?.live && <StreamingText call={data.live} />}
        {data && data.calls.length === 0 && !data.live && <p className="text-sm text-muted">No model call yet.</p>}
        {data?.calls.map((call) => (
          <CallCard key={call.id} call={call} />
        ))}
      </div>
    </section>
  );
}
