"use client";

import { useState } from "react";
import useSWR from "swr";

import { GateOverview, type GateHeldList, type GateSenderList } from "@/lib/api/gate-schemas";
import { parsedFetcher } from "@/lib/poll";

import { GateHeader } from "./gate-header";
import { HeldTable } from "./held-table";
import { SendersTable } from "./senders-table";

/**
 * The header, then one of two panes.
 *
 * Tabs rather than two stacked tables, because the two answer different
 * questions: "who is sending us what" is a standing view a person browses, and
 * "what is waiting" is a queue a person works through. The waiting count sits
 * on its tab so the first is never the reason the second went unnoticed.
 */

const fetchOverview = parsedFetcher(GateOverview);
/** The spend and the buckets, which move with traffic. */
const EVERY_MS = 8000;

interface Props {
  overview: GateOverview | null;
  senders: GateSenderList | null;
  held: GateHeldList | null;
  backendError: string | null;
}

export function GatePanes({ overview, senders, held, backendError }: Props) {
  const [pane, setPane] = useState<"senders" | "held">("senders");
  const { data } = useSWR("/api/gate", fetchOverview, {
    fallbackData: overview ?? undefined,
    refreshInterval: EVERY_MS,
    keepPreviousData: true,
  });

  return (
    <>
      {data ? <GateHeader overview={data} /> : null}

      <nav className="mt-5 flex gap-1 border-b border-hairline" aria-label="Which pane">
        <Tab active={pane === "senders"} onClick={() => setPane("senders")} label="Senders" />
        <Tab active={pane === "held"} onClick={() => setPane("held")} label="Waiting" count={data?.waiting ?? 0} />
      </nav>

      {pane === "senders" ? (
        <SendersTable initial={senders} initialError={backendError} />
      ) : (
        <HeldTable initial={held} initialError={backendError} />
      )}
    </>
  );
}

function Tab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-strong transition-colors duration-150 ${
        active ? "border-ink text-ink" : "border-transparent text-ink-tertiary hover:text-ink-secondary"
      }`}
    >
      {label}
      {count ? <span className="font-mono text-mono-xs text-ink-tertiary">{count}</span> : null}
    </button>
  );
}
