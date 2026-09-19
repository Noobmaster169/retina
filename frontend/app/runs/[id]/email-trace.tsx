"use client";

import Link from "next/link";
import useSWR from "swr";

import { LlmCallList } from "@/lib/api/trace-schemas";
import { parsedFetcher } from "@/lib/poll";

import { CallCard } from "./call-card";

const POLL_MS = 4000;
const fetchCalls = parsedFetcher(LlmCallList);

interface Props {
  runId: string;
  emailId: string | null;
}

/** The chosen email's model calls in the order they were made: the generator, then the verifier if it ran. */
export function EmailTrace({ runId, emailId }: Props) {
  const { data, error } = useSWR(emailId ? `/api/runs/${runId}/emails/${emailId}/calls` : null, fetchCalls, {
    refreshInterval: POLL_MS,
  });

  if (!emailId) {
    return (
      <section className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">
        Pick an email to see every model call made for it: the exact input, the exact output, and what it cost.
      </section>
    );
  }

  return (
    <section className="min-w-0">
      <div className="flex items-baseline gap-3">
        <h2 className="font-mono text-base font-semibold">{emailId}</h2>
        <Link href={`/mail/${emailId}`} className="text-sm text-muted hover:text-accent-ink">
          open the email
        </Link>
      </div>
      {error instanceof Error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error.message}
        </p>
      )}
      {data && data.calls.length === 0 && <p className="mt-3 text-sm text-muted">No model call yet.</p>}
      <div className="mt-3 flex flex-col gap-3">
        {data?.calls.map((call) => (
          <CallCard key={call.id} call={call} />
        ))}
      </div>
    </section>
  );
}
