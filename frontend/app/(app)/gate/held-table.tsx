"use client";

import { useState } from "react";
import useSWR from "swr";

import { useToast } from "@/components/ui/toast";
import { GateHeldList, type GateHeldRow } from "@/lib/api/gate-schemas";
import { parsedFetcher } from "@/lib/poll";
import { formatWhenShort } from "@/lib/when";

import { costLine, heldBecause } from "./wording";

/**
 * The holding pen: emails nobody has paid to read, and the button that changes
 * that.
 *
 * Every row says why in a sentence built from the numbers the decision was
 * actually made on, and what reading it would have cost. Releasing is the
 * whole point of the screen: a hold is a guess, and this is where a person
 * overrules it.
 */

const fetchHeld = parsedFetcher(GateHeldList);
/** What the gate is holding. A hold appears when an email arrives and leaves when a person releases it. */
const EVERY_MS = 15_000;

export function HeldTable({ initial, initialError }: { initial: GateHeldList | null; initialError: string | null }) {
  const { data, error, mutate } = useSWR("/api/gate/held", fetchHeld, {
    fallbackData: initial ?? undefined,
    refreshInterval: EVERY_MS,
    revalidateOnMount: initialError !== null,
    keepPreviousData: true,
  });

  const held = data?.held ?? [];
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
            <Th className="w-[210px]">Email</Th>
            <Th>Why it is waiting</Th>
            <Th className="w-[210px]">What it would cost</Th>
            <Th className="w-[104px] text-right">Held at</Th>
            <Th className="w-[104px]">&nbsp;</Th>
          </tr>
        </thead>
        <tbody>
          {held.map((row) => (
            <HeldRow key={row.id} row={row} onReleased={() => void mutate()} />
          ))}
        </tbody>
      </table>

      {held.length === 0 && !message ? (
        <p className="py-10 text-center text-small text-ink-tertiary">Nothing is waiting. Every email that arrived was worth reading.</p>
      ) : null}
    </>
  );
}

function HeldRow({ row, onReleased }: { row: GateHeldRow; onReleased: () => void }) {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function release() {
    setPending(true);
    try {
      const response = await fetch(`/api/gate/held/${encodeURIComponent(row.id)}/release`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.refuse(body?.error ?? "That could not be released.");
        return;
      }
      toast.say(`${row.emailId} was let through.`, "It is in the pipeline now, and the gate will not be asked about it again.");
      onReleased();
    } catch (error) {
      console.error("[gate] releasing an email failed:", error);
      toast.refuse("The backend is not reachable right now.");
    } finally {
      setPending(false);
    }
  }

  return (
    <tr className="border-b border-hairline last:border-b-0">
      <td className="py-2.5 pr-4 align-middle">
        <div className="font-mono text-mono-sm text-ink">{row.emailId}</div>
        <div className="truncate text-caption text-ink-tertiary">{row.from}</div>
      </td>

      <td className="py-2.5 pr-4 align-middle text-small text-ink-secondary">{heldBecause(row)}</td>

      <td className="py-2.5 pr-4 align-middle text-caption text-ink-tertiary">{costLine(row)}</td>

      <td className="py-2.5 pr-4 text-right align-middle font-mono text-mono-xs text-ink-tertiary">{formatWhenShort(row.decidedAt)}</td>

      <td className="py-2.5 align-middle">
        <button
          type="button"
          disabled={pending}
          onClick={() => void release()}
          className="h-8 rounded-md border border-hairline-strong bg-canvas px-3 text-strong text-ink transition-colors duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Let through
        </button>
      </td>
    </tr>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`h-8 pr-4 align-middle text-caption font-normal text-ink-tertiary ${className}`}>{children}</th>;
}
