"use client";

import Link from "next/link";

import { ClientsTable } from "@/app/(app)/clients/clients-table";
import { Icon } from "@/components/ui/icons";
import { Panel, PanelHead } from "@/components/ui/panel";

/**
 * Who is served first, under the run it decides the shape of.
 *
 * It was a destination of its own under Business data, which is where a
 * company and a port live: things the mail resolved, that a replay reads and
 * never changes. A sender's tier is not one of those. It is a dial on the
 * pipeline, the only one a person turns that changes what the queues do, and
 * it belongs beside the picture of the queues doing it. Moving a sender up
 * here and watching the next run's flow answer is one screen, not two.
 *
 * `/clients` still exists and still works; it is simply not offered in the
 * rail any more, because two doors to one table is how the two drift.
 */
export function SendersPanel({ className = "" }: { className?: string }) {
  return (
    <Panel className={`overflow-hidden ${className}`}>
      <PanelHead
        title="Who is served first"
        aside={
          <Link href="/clients" className="flex items-center gap-1.5 text-small text-ink-tertiary transition-colors duration-150 hover:text-ink">
            Open on its own
            <Icon name="chevron" size={11} />
          </Link>
        }
      />
      <p className="px-4 pb-2 text-small text-ink-tertiary">
        Drag a sender towards <span className="text-ink-secondary">First</span> and their mail enters the queue ahead of everyone
        else&apos;s. Emails already queued keep the place they came in at.
      </p>
      <div className="min-h-0 grow overflow-y-auto px-4 pb-3">
        <ClientsTable initialList={null} initialError={null} />
      </div>
    </Panel>
  );
}
