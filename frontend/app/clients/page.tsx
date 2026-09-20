import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { TopBar } from "@/components/shell/top-bar";
import { type ClientList, listClients } from "@/lib/api-client";

import { ClientsTable } from "./clients-table";

// Reads the backend on every request; there is nothing here to prerender.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Clients · Retina SDOC" };

async function loadClients(): Promise<{ list: ClientList | null; backendError: string | null }> {
  try {
    return { list: await listClients(), backendError: null };
  } catch (error) {
    console.error("[clients] backend call failed:", error);
    return { list: null, backendError: "The backend is not reachable right now." };
  }
}

/**
 * The senders, and which of them the queue serves first.
 *
 * The one screen that is not about a run. A tier is a standing decision about
 * a client, not a property of one replay, so it sits outside `/runs/{id}` and
 * every run reads the same answer.
 */
export default async function ClientsPage() {
  const { list, backendError } = await loadClients();

  return (
    <AppShell active="clients" counts={{}}>
      <div className="flex min-w-0 grow flex-col">
        <TopBar crumbs={[{ label: "Clients" }]} />
        <main className="min-h-0 grow overflow-y-auto px-7 pb-8">
          <div className="py-5">
            <h1 className="font-display text-display font-normal tracking-[-0.01em]">Clients</h1>
            <p className="mt-0.5 max-w-[68ch] text-body text-ink-tertiary">
              Which sender&rsquo;s work the queue takes first when everything arrives at once. A tier orders the queue
              and nothing else: the model reads every email and names its own category, whoever sent it and whatever
              you have labelled them here.
            </p>
          </div>
          <ClientsTable initialList={list} initialError={backendError} />
        </main>
      </div>
    </AppShell>
  );
}
