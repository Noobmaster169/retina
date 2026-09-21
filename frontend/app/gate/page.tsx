import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { TopBar } from "@/components/shell/top-bar";
import { type GateHeldList, getGate, type GateOverview, type GateSenderList, listGateSenders, listHeld } from "@/lib/api-client";

import { GatePanes } from "./gate-panes";

// Reads the backend on every request; there is nothing here to prerender.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Traffic · Retina SDOC" };

interface Loaded {
  overview: GateOverview | null;
  senders: GateSenderList | null;
  held: GateHeldList | null;
  backendError: string | null;
}

async function load(): Promise<Loaded> {
  try {
    const [overview, senders, held] = await Promise.all([getGate(), listGateSenders(), listHeld()]);
    return { overview, senders, held, backendError: null };
  } catch (error) {
    console.error("[gate] backend call failed:", error);
    return { overview: null, senders: null, held: null, backendError: "The backend is not reachable right now." };
  }
}

/**
 * Whose mail we pay to read.
 *
 * The other screen that is not about a run. What a sender has earned is a
 * standing fact about that sender, not a property of one replay, and every run
 * reads the same answer.
 *
 * It sits beside Clients rather than inside it on purpose. A tier says which
 * client's work is taken first; this says whether we spend anything on it at
 * all. Putting a blocklist on a page whose copy promises that a tier decides
 * nothing else would make both harder to trust.
 */
export default async function GatePage() {
  const loaded = await load();

  return (
    <AppShell active="gate" counts={{ gate: loaded.overview?.waiting ?? 0 }}>
      <div className="flex min-w-0 grow flex-col">
        <TopBar crumbs={[{ label: "Traffic" }]} />
        <main className="min-h-0 grow overflow-y-auto px-7 pb-8">
          <div className="py-5">
            <h1 className="font-display text-display font-normal tracking-[-0.01em]">Traffic</h1>
            <p className="mt-0.5 max-w-[72ch] text-body text-ink-tertiary">
              Whether an email is worth what reading it will cost, decided by arithmetic over how much arrived, how
              often, and how long we have known the sender. It never reads the words in an email and it never decides
              what one is: the model classifies everything that gets through, whoever sent it.
            </p>
          </div>
          <GatePanes {...loaded} />
        </main>
      </div>
    </AppShell>
  );
}
