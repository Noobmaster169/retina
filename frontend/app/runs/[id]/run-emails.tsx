"use client";

import { useState } from "react";
import useSWR from "swr";

import { ReviewReason } from "@/lib/api/runs-schemas";
import { Category, DecidedBy, RunEmailsPage } from "@/lib/api/trace-schemas";
import { parsedFetcher } from "@/lib/poll";

import { CategoryBadge } from "./category-badge";

const POLL_MS = 3000;
const PAGE_SIZE = 50;
const fetchPage = parsedFetcher(RunEmailsPage);
const SELECT = "rounded-md border border-line bg-paper px-2 py-1.5 text-sm";
/** How an email can end: not sent to compare, compared, or parked for a person with the organisers' reason. */
const OUTCOMES = ["not_comparable", "OK", ...ReviewReason.options];

interface Props {
  runId: string;
  /** False once the run is finished: the list stops polling. */
  live: boolean;
  selected: string | null;
  onSelect: (emailId: string) => void;
}

/** Every email of the run with what the pipeline decided about it. A row opens its model calls. */
export function RunEmails({ runId, live, selected, onSelect }: Props) {
  const [category, setCategory] = useState("");
  const [decidedBy, setDecidedBy] = useState("");
  const [outcome, setOutcome] = useState("");
  const [page, setPage] = useState(1);

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (category) query.set("category", category);
  if (decidedBy) query.set("decidedBy", decidedBy);
  if (outcome) query.set("outcome", outcome);
  const { data, error } = useSWR(`/api/runs/${runId}/emails?${query.toString()}`, fetchPage, {
    refreshInterval: live ? POLL_MS : 0,
    // A filter or page change keeps the old rows until the new ones arrive, instead of blanking the table.
    keepPreviousData: true,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">Emails</h2>
        <select aria-label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className={SELECT}>
          <option value="">Every category</option>
          {Category.options.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label="Decided by" value={decidedBy} onChange={(e) => { setDecidedBy(e.target.value); setPage(1); }} className={SELECT}>
          <option value="">Decided by anyone</option>
          {DecidedBy.options.map((d) => (
            <option key={d} value={d}>
              {d === "llm" ? "generator alone" : d}
            </option>
          ))}
        </select>
        <select aria-label="Outcome" value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(1); }} className={SELECT}>
          <option value="">Every outcome</option>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {data && <span className="text-sm tabular-nums text-muted">{data.total} emails</span>}
      </div>

      {error instanceof Error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <div className="mt-3 overflow-x-auto border-t border-line">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-medium">Email</th>
              <th className="py-2 pr-3 font-medium">Category</th>
              <th className="py-2 pr-3 font-medium">Confidence</th>
              <th className="py-2 pr-3 font-medium">Outcome</th>
              <th className="py-2 font-medium">Stage</th>
            </tr>
          </thead>
          <tbody>
            {data?.emails.map((email) => (
              <tr
                key={email.emailId}
                onClick={() => onSelect(email.emailId)}
                className={`cursor-pointer border-b border-line align-top hover:bg-paper ${selected === email.emailId ? "bg-sel" : ""}`}
              >
                <td className="max-w-72 py-2 pr-3">
                  <div className="font-mono text-xs">{email.emailId}</div>
                  <div className="truncate text-xs text-muted" title={email.subject}>
                    {email.subject}
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <CategoryBadge email={email} />
                </td>
                <td className="py-2 pr-3 tabular-nums">{email.confidence === null ? "" : email.confidence.toFixed(2)}</td>
                <td className={`py-2 pr-3 text-xs ${email.stage === "review" ? "text-amber-700" : "text-muted"}`}>{email.outcome ?? ""}</td>
                <td className={`py-2 text-xs ${email.stage === "failed" ? "text-red-700" : "text-muted"}`} title={email.error ?? undefined}>
                  {email.stage}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-3 flex items-center gap-3 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40">
            Previous
          </button>
          <span className="tabular-nums text-muted">
            Page {page} of {pages}
          </span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </section>
  );
}
