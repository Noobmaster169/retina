"use client";

import useSWR from "swr";

import { RunList } from "@/lib/api/runs-schemas";
import { parsedFetcher } from "@/lib/poll";

import { NewRunForm } from "./new-run-form";
import { RunRow } from "./run-row";

/**
 * The runs, one row each. A list is a list: this page is for choosing a run,
 * so nothing on a row is a control and nothing on it is machinery. Pausing,
 * cancelling and submitting live on the run's own page, and what a run cost
 * lives in that page's `What it took` panel, per `05-design.md` section 11.
 */

const POLL_MS = 3000;
const fetchRuns = parsedFetcher(RunList);

interface Props {
  initialList: RunList | null;
  initialError: string | null;
}

export function RunsTable({ initialList, initialError }: Props) {
  const { data, error, mutate } = useSWR("/api/runs", fetchRuns, {
    fallbackData: initialList ?? undefined,
    refreshInterval: POLL_MS,
    revalidateOnMount: initialError !== null,
    keepPreviousData: true,
  });
  const runs = data?.runs ?? [];
  const message = error instanceof Error ? error.message : !data ? initialError : null;

  return (
    <>
      <NewRunForm onCreated={() => void mutate()} />

      {message ? (
        <p role="alert" className="mt-4 border-l-2 border-fault pl-3 text-small text-fault">
          {message}
        </p>
      ) : null}

      <table className="mt-5 w-full text-left">
        <thead>
          <tr className="border-b border-hairline">
            <Th className="w-[186px]">Started</Th>
            <Th className="w-[104px]">Status</Th>
            <Th className="w-[72px]">Pace</Th>
            <Th className="w-[210px]">Emails</Th>
            <Th>Where they ended up</Th>
            <Th className="w-[132px] text-right">Score</Th>
            <Th className="w-[52px] text-right" hidden>Delete</Th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <RunRow key={run.id} run={run} onDeleted={() => void mutate()} />
          ))}
        </tbody>
      </table>

      {runs.length === 0 && !message ? (
        <p className="py-10 text-center text-small text-ink-tertiary">No runs yet. Start one above.</p>
      ) : null}
    </>
  );
}

/** Sentence case at the caption size. Section 5.1 retired the uppercase label. */
function Th({ children, className = "", hidden = false }: { children: string; className?: string; hidden?: boolean }) {
  return (
    <th className={`h-8 pr-4 align-middle text-caption font-normal text-ink-tertiary ${className}`}>
      {hidden ? <span className="sr-only">{children}</span> : children}
    </th>
  );
}
