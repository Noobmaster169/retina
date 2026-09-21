import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getEmail, getEmailTrace } from "@/lib/api-client";

import { PrintNow } from "./print-now";
import { ReportDoc } from "./report-doc";

export const dynamic = "force-dynamic";

const RUN_ID = /^[0-9a-f-]{36}$/;
// Mirrors EMAIL_ID_REGEX in backend/src/emails.ts; change both or neither.
const EMAIL_ID = /^email_\d{1,6}$/;

export async function generateMetadata({ params }: PageProps<"/report/[runId]/[emailId]">): Promise<Metadata> {
  const { emailId } = await params;
  // The browser names the saved PDF after the page title, so the title is the filename.
  return { title: `Retina check ${emailId}` };
}

/**
 * The check as a document, outside the shell, for printing or sending on.
 *
 * Its own route and not a dialog over the inbox, for three reasons that all
 * point the same way: it is outside `(app)` so no rail, dock or tab strip has
 * to be hidden for print; it is a URL, so the report of one email can be sent
 * to somebody who then reads the same thing; and the export is the browser's
 * own print to PDF, which sets real type and leaves the text selectable, where
 * a PDF drawn in JavaScript would set neither.
 */
export default async function Page({ params, searchParams }: PageProps<"/report/[runId]/[emailId]">) {
  const { runId, emailId } = await params;
  if (!RUN_ID.test(runId) || !EMAIL_ID.test(emailId)) notFound();

  const [asked, trace, email] = await Promise.all([searchParams, getEmailTrace(runId, emailId), getEmail(emailId)]);
  if (!trace) notFound();

  return (
    <main className="min-h-dvh bg-canvas text-ink">
      <PrintNow when={asked.print === "1"} />
      <div className="mx-auto flex max-w-[820px] items-center gap-2 px-8 pt-6 print:hidden">
        <span className="text-caption text-ink-tertiary">
          run {runId.slice(0, 8)} · this page prints as the report
        </span>
        <span className="grow" />
        <PrintButton />
      </div>
      <ReportDoc trace={trace} email={email} />
    </main>
  );
}

/** A form and not a script: the one control here works before any JavaScript arrives. */
function PrintButton() {
  return (
    <a
      href="?print=1"
      className="flex h-8 items-center rounded-md border border-hairline-strong px-3 text-strong text-ink-secondary transition-colors duration-150 hover:border-ink-faint hover:text-ink"
    >
      Print or save as PDF
    </a>
  );
}
