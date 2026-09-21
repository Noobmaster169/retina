"use client";

import useSWR from "swr";

import { GateSenderList } from "@/lib/api/gate-schemas";
import { parsedFetcher } from "@/lib/poll";

import { SenderRow } from "./sender-row";

/**
 * Every principal the gate has an opinion about, busiest today first.
 *
 * Driven by what arrived, not by a list this product carries around: the same
 * argument the clients page makes. A sender somebody blocked is on it too,
 * even if nothing has arrived from it since, because a decision nobody can
 * find is a decision nobody can undo.
 */

const fetchSenders = parsedFetcher(GateSenderList);
const EVERY_MS = 5000;

interface Props {
  initial: GateSenderList | null;
  initialError: string | null;
}

export function SendersTable({ initial, initialError }: Props) {
  const { data, error, mutate } = useSWR("/api/gate/senders", fetchSenders, {
    fallbackData: initial ?? undefined,
    refreshInterval: EVERY_MS,
    revalidateOnMount: initialError !== null,
    keepPreviousData: true,
  });

  const senders = data?.senders ?? [];
  const message = error instanceof Error ? error.message : !data ? initialError : null;

  return (
    <>
      {message ? (
        <p role="alert" className="mt-4 border-l-2 border-fault pl-3 text-small text-fault">
          {message}
        </p>
      ) : null}

      <table className="mt-1 w-full text-left">
        <thead>
          <tr className="border-b border-hairline">
            <Th className="w-[260px]">Sender</Th>
            <Th className="w-[240px]">Standing</Th>
            <Th className="w-[260px]">Today</Th>
            <Th className="w-[88px] text-right">Held</Th>
            <Th className="w-[190px]">&nbsp;</Th>
          </tr>
        </thead>
        <tbody>
          {senders.map((sender) => (
            <SenderRow key={`${sender.scope}:${sender.principal}`} sender={sender} onSaved={() => void mutate()} />
          ))}
        </tbody>
      </table>

      {senders.length === 0 && !message ? (
        <p className="py-10 text-center text-small text-ink-tertiary">
          Nothing has arrived yet. Start a run and every sender appears here with what it has earned.
        </p>
      ) : null}
    </>
  );
}

/** Sentence case at the caption size. Section 5.1 retired the uppercase label. */
function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`h-8 pr-4 align-middle text-caption font-normal text-ink-tertiary ${className}`}>{children}</th>;
}
