"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";

import { EmailPane } from "@/components/email/email-pane";
import { chatScope, openingLine } from "@/components/email/email-reading";
import { ChatRail } from "@/components/email/chat-rail";
import { CaseList } from "@/components/review/case-list";
import { Icon } from "@/components/ui/icons";
import { NavCounts } from "@/components/shell/nav-counts";
import { TopBar } from "@/components/shell/top-bar";
import { Email } from "@/lib/api/mail-client";
import { ReviewQueue } from "@/lib/api/review-schemas";
import { EmailTrace } from "@/lib/api/trace-schemas";
import { parsedFetcher } from "@/lib/poll";

/**
 * The review queue, in the same shell as everything else: the cases on the
 * left, and the case pane in the middle, which is the email page's own pane
 * with its case tab selected. Phase 8 adds the queue in front of that pane and
 * the write path behind it, and builds no second component set.
 *
 * Which case is open lives in the URL, so a case can be handed to someone.
 */

const QUEUE_MS = 3000;
const CASE_MS = 2000;

export function ReviewPage({ runId }: { runId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const emailId = params.get("email");

  const { data: queue, isLoading, mutate: reread } = useSWR(`/api/review?runId=${runId}&status=open`, parsedFetcher(ReviewQueue), {
    refreshInterval: QUEUE_MS,
    keepPreviousData: true,
  });
  const cases = queue?.cases ?? [];
  const selected = cases.find((one) => one.emailId === emailId) ?? null;

  // A rerun moves an email through the pipeline, so the open case polls faster
  // than the queue: what a person is looking at should settle before the list.
  const { data: trace, isLoading: caseLoading, mutate: rereadCase } = useSWR(
    emailId ? `/api/runs/${runId}/emails/${emailId}/trace` : null,
    parsedFetcher(EmailTrace),
    { refreshInterval: CASE_MS, keepPreviousData: false },
  );

  // The message is the sender's and the trace is the run's: two reads, because
  // the seam on the pane exists to say which is which.
  const { data: email, isLoading: emailLoading } = useSWR(emailId ? `/api/emails/${emailId}` : null, parsedFetcher(Email), {
    keepPreviousData: false,
  });

  const changed = useCallback(() => {
    void rereadCase();
    void reread();
  }, [rereadCase, reread]);

  const open = (nextEmailId: string) => router.replace(`/runs/${runId}/review?email=${nextEmailId}`, { scroll: false });

  return (
    <>
      <NavCounts counts={{ review: queue?.total ?? 0 }} />
      <CaseList cases={cases} selectedId={selected?.id ?? null} onSelect={(item) => open(item.emailId)} loading={isLoading} />

      {emailId && trace && email ? (
        <EmailPane
          key={emailId}
          trace={trace}
          message={{ from: email.from, subject: email.subject, body: email.body, attachments: email.attachments }}
          subject={email.subject}
          onChanged={changed}
        />
      ) : (
        <Empty runId={runId} waiting={cases.length} chosen={emailId !== null} loading={caseLoading || emailLoading} />
      )}

      {emailId && trace && email ? (
        <ChatRail
          key={emailId}
          runId={runId}
          emailId={emailId}
          scope={chatScope(trace)}
          opening={openingLine(trace)}
          suggestions={["Why did this need a person?", "What did the parser see?"]}
        />
      ) : null}
    </>
  );
}

/**
 * The rectangle when nothing is open. An empty panel gets replaced, not
 * padded: it says what the queue holds rather than standing in for a case.
 */
function Empty({ runId, waiting, chosen, loading }: { runId: string; waiting: number; chosen: boolean; loading: boolean }) {
  return (
    <div className="flex min-w-0 grow flex-col">
      <TopBar crumbs={[{ label: "Runs", href: "/runs" }, { label: runId.slice(0, 8), href: `/runs/${runId}`, mono: true }, { label: "Needs a person" }]} />
      <div className="flex min-h-0 grow flex-col items-center justify-center px-6">
        <Icon name="eye" size={22} className="text-ink-faint" />
        <p className="mt-3 max-w-[48ch] text-center text-body text-ink-tertiary">
          {loading
            ? "Reading the case."
            : chosen
            ? "That case is no longer open. It was either settled or it moved on."
            : waiting === 0
              ? "Nothing is waiting for a person in this run."
              : "Choose a case to read why Retina stopped, and to say what it should have read."}
        </p>
      </div>
    </div>
  );
}
