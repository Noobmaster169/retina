import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { type EvalReport, getEvalReport, getRun, listSubmissions, type SubmissionList } from "@/lib/api-client";

import { ScoreboardView } from "./scoreboard-view";
import { VerdictTable } from "./verdict-table";

export const dynamic = "force-dynamic";

const RUN_ID = /^[0-9a-f-]{36}$/;

export async function generateMetadata({ params }: PageProps<"/runs/[id]/results">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Results ${id.slice(0, 8)} · Retina` };
}

interface Loaded {
  submission: SubmissionList["submissions"][number] | null;
  report: EvalReport | null;
  failed: string | null;
}

/** The newest scored submission, and the local comparison with the truth where this backend holds the answer key. */
async function load(id: string): Promise<Loaded> {
  try {
    const [submissions, report] = await Promise.all([listSubmissions(id), getEvalReport(id)]);
    return { submission: submissions.submissions.find((s) => s.scoreboard) ?? null, report, failed: null };
  } catch (error) {
    console.error("[results] backend call failed:", error);
    return { submission: null, report: null, failed: "The backend is not reachable right now. Reload in a moment." };
  }
}

export default async function ResultsPage({ params }: PageProps<"/runs/[id]/results">) {
  const { id } = await params;
  if (!RUN_ID.test(id)) notFound();
  const run = await getRun(id).catch(() => null);
  if (!run) notFound();
  const { submission, report, failed } = await load(id);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center gap-4 border-b border-hairline bg-sunken px-5 py-3">
        <Link href="/runs" className="text-sm text-ink-tertiary hover:text-ink">
          Runs
        </Link>
        <Link href={`/runs/${id}`} className="font-mono text-sm text-ink-tertiary hover:text-ink">
          {id.slice(0, 8)}
        </Link>
        <span className="text-sm">Results</span>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-6">
        {failed && <p role="alert" className="border-l-2 border-fault pl-3 text-sm text-fault">{failed}</p>}

        <section>
          <h1 className="text-xl font-semibold tracking-tight">The organisers&apos; scorer</h1>
          {submission?.scoreboard ? (
            <>
              <p className="mt-1 text-sm text-ink-tertiary">
                Submitted {new Date(submission.createdAt).toLocaleString()} with {submission.nEmails} emails
                {submission.forced ? ", forced before every email had finished" : ""}. It scores the whole inbox: an email the
                run did not answer counts as GENERAL.
              </p>
              <div className="mt-3">
                <ScoreboardView board={submission.scoreboard} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-tertiary">Not submitted yet. Submit the run from the runs list to score it.</p>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight">Against the answer key, email by email</h2>
          {report ? (
            <>
              <p className="mt-1 text-sm text-ink-tertiary">
                Scored on this machine over the run&apos;s own {report.run.n_emails} emails, the same way the organisers
                score. The scorer only reports totals, so this is where each email&apos;s answer meets its truth.
              </p>
              <div className="mt-3">
                <ScoreboardView board={report.run} />
              </div>
              <div className="mt-6">
                <VerdictTable verdicts={report.emails} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-tertiary">
              Only on a machine whose backend has the answer key (EVAL_GROUND_TRUTH_PATH). The deployed backend never does.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
