"use client";

import useSWR from "swr";

import { ClientList } from "@/lib/api/clients-schemas";
import { parsedFetcher } from "@/lib/poll";

import { ClientRow } from "./client-row";

/**
 * Every sender the inbox has seen, most urgent first.
 *
 * The list is driven by what actually arrived, not by a table of clients
 * somebody seeded: a sender with no row of its own is on it too, at the
 * default tier, marked as nobody's decision. That is what keeps this a view of
 * the inbox rather than a list this product carries around.
 */

const fetchClients = parsedFetcher(ClientList);

interface Props {
  initialList: ClientList | null;
  initialError: string | null;
}

export function ClientsTable({ initialList, initialError }: Props) {
  const { data, error, mutate } = useSWR("/api/clients", fetchClients, {
    fallbackData: initialList ?? undefined,
    revalidateOnMount: initialError !== null,
    keepPreviousData: true,
  });
  const clients = data?.clients ?? [];
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
            <Th className="w-[148px]">Served</Th>
            <Th className="w-[148px]">Kind</Th>
            <Th className="w-[96px] text-right">Emails</Th>
            <Th className="w-[128px] text-right">Mismatches</Th>
            <Th>&nbsp;</Th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <ClientRow key={client.domain} client={client} onSaved={() => void mutate()} />
          ))}
        </tbody>
      </table>

      {clients.length === 0 && !message ? (
        <p className="py-10 text-center text-small text-ink-tertiary">
          No sender has emailed yet. Start a run and they appear here.
        </p>
      ) : null}
    </>
  );
}

/** Sentence case at the caption size. Section 5.1 retired the uppercase label. */
function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`h-8 pr-4 align-middle text-caption font-normal text-ink-tertiary ${className}`}>{children}</th>;
}
