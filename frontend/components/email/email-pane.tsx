"use client";

import { useState } from "react";

import { ActionBar } from "@/components/review/action-bar";
import { useReviewer } from "@/components/review/reviewer";
import { useCaseActions } from "@/components/review/use-case-actions";
import { Chip } from "@/components/ui/chip";
import { TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import type { EmailTrace } from "@/lib/api/trace-schemas";

import { CaseTab } from "./case-tab";
import { ClassificationChip, classificationLabel } from "./classification-chip";
import { CallsTab } from "./calls-tab";
import { CheckTab, rowsOf } from "./check-tab";
import { DocumentsTab } from "./documents-tab";
import { hasReport, wrongDocuments } from "./report-eligible";
import { ReportTab } from "./report-tab";
import { statusOf } from "./email-reading";
import type { Message } from "./message-card";

/**
 * One email: the message, the seam, and what Retina made of it. Tabs over one
 * page, never a page each, because they are readings of the same thing and the
 * message stays above all of them.
 *
 * Only `The check` is always there. `Report` needs a comparison to report or a
 * wrong-document finding to explain,
 * `Both documents` needs documents to show and `Model calls` needs a call to
 * have been made, and most of this inbox has no pair at all:
 * a spam mail and an invoice query have nothing to compare, and a tab that
 * opened on an empty table said the check had been skipped rather than that
 * there was never one to run.
 *
 * Which tab is open belongs to the screen and not to this pane. Moving down a
 * list of cases while reading `Both documents` should keep reading both
 * documents, and a pane that owned its own tab would drop back to the first
 * one on every row. An email that does not offer the tab being read falls back
 * to `The check` without forgetting it, so the next one that does offer it
 * opens there again. Everything else here is per email and resets with it.
 */

interface EmailPaneProps {
  /** The run this email was read in. Only the report's address needs it; nothing here reads through it. */
  runId: string;
  trace: EmailTrace;
  message: Message;
  subject: string;
  /** Which reading is open. Held by the screen, so it survives moving to the next email. */
  tab: string;
  onTab: (tab: string) => void;
  /** Re-read the trace and whatever list is beside it, after a write. */
  onChanged: () => void;
}

export function EmailPane({ runId, trace, message, subject, tab, onTab, onChanged }: EmailPaneProps) {
  const [correctingField, setCorrectingField] = useState<string | null>(null);
  const reviewer = useReviewer();
  const review = trace.review;
  const actions = useCaseActions(review?.id ?? null, reviewer.name, onChanged);

  const rows = rowsOf(trace);
  const reportable = hasReport(trace);
  const status = statusOf(trace);
  const classification = trace.classification?.humanCategory ?? trace.classification?.finalCategory ?? null;
  const showStatus = classification === null || status.value !== classificationLabel(classification);
  const reportCount = rows.length > 0 ? rows.length : wrongDocuments(trace).length;
  const tabs = [
    { value: "check", label: review ? "The case" : "The check", count: review ? 1 : rows.length },
    ...(reportable ? [{ value: "report", label: "Report", count: reportCount }] : []),
    ...(trace.documents.length > 0 ? [{ value: "documents", label: "Both documents", count: trace.documents.length }] : []),
    ...(trace.calls.length > 0 ? [{ value: "calls", label: "Model calls", count: trace.calls.length }] : []),
  ];
  const open = tabs.some((one) => one.value === tab) ? tab : "check";
  const correctable = review?.status === "open" && review.kind === "review" && rows.length > 0;

  const correcting = correctable
    ? {
        field: correctingField,
        pending: actions.pending === "correct_field",
        open: setCorrectingField,
        close: () => setCorrectingField(null),
        record: (field: string, side: "SI" | "BL", value: string) => {
          void actions.act({ kind: "correct_field", field, side, value });
        },
      }
    : undefined;

  return (
    <Tabs value={open} onValueChange={onTab} className="flex min-w-0 grow flex-col border-r border-hairline">
      {/* The email's own title. The way back to the list sits on the bar above. */}
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-hairline px-4 md:px-6">
        <h1 className="min-w-0 grow truncate text-title font-semibold tracking-[-0.015em]">{subject}</h1>
        {classification ? <ClassificationChip category={classification} className="max-w-[180px]" /> : null}
        {showStatus ? <Chip tone={status.tone}>{status.value}</Chip> : null}
      </header>

      <div className="flex h-[42px] shrink-0 items-stretch gap-5 border-b border-hairline px-4 md:px-6">
        <TabList layoutId="email-tabs" value={open} tabs={tabs} />
      </div>

      <div className="flex min-h-0 grow flex-col overflow-y-auto">
        <TabPanel value="check" className="flex min-h-0 grow flex-col focus-visible:outline-none">
          {review ? (
            <CaseTab trace={trace} message={message} review={review} correcting={correcting} />
          ) : (
            <CheckTab trace={trace} message={message} />
          )}
        </TabPanel>
        <TabPanel value="report" className="flex min-h-0 grow flex-col focus-visible:outline-none">
          <ReportTab runId={runId} trace={trace} rows={rows} />
        </TabPanel>
        <TabPanel value="documents" className="flex min-h-0 grow flex-col focus-visible:outline-none">
          <DocumentsTab trace={trace} />
        </TabPanel>
        <TabPanel value="calls" className="focus-visible:outline-none">
          <CallsTab calls={trace.calls} />
        </TabPanel>
      </div>

      {review?.kind === "failure" ? (
        <ActionBar
          review={review}
          actions={actions}
          actor={reviewer.name}
          onName={reviewer.set}
        />
      ) : null}
    </Tabs>
  );
}
