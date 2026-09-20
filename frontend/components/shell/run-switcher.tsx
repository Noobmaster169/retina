"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { motion } from "motion/react";

import { Bar } from "@/components/ui/panel";
import { Icon } from "@/components/ui/icons";
import type { RunSummary } from "@/lib/api/runs-schemas";
import { panel } from "@/lib/motion";

import { runName } from "./run-name";

/**
 * Which run everything below is read through. A run is the context this whole
 * product works in, not a page inside it: the inbox, the cases and the records
 * all mean "of this run", so choosing one belongs in the shell beside the
 * destinations rather than on a page you navigate away from.
 *
 * Switching keeps you where you are. Looking at the inbox of one run and
 * picking another lands on the inbox of that one, which is the whole point:
 * it is how two prompt versions get compared on the same screen.
 */

interface RunSwitcherProps {
  /** The run in context, or null when there are none at all. */
  current: RunSummary | null;
  runs: RunSummary[];
  open: boolean;
}

export function RunSwitcher({ current, runs, open }: RunSwitcherProps) {
  const pathname = usePathname();
  const suffix = current ? pathname.replace(`/runs/${current.id}`, "") : "";

  if (!open) {
    return (
      <div className="flex justify-center py-2">
        <Link
          href="/runs"
          aria-label="Choose a run"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-md text-ink-tertiary transition-colors duration-150 hover:bg-active hover:text-ink"
        >
          <Icon name="clock" />
        </Link>
      </div>
    );
  }

  return (
    <div className="px-3 pb-1 pt-2">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="group flex w-full items-center gap-2 rounded-md border border-hairline px-2.5 py-2 text-left transition-colors duration-150 hover:border-hairline-strong">
          <span className="min-w-0 grow">
            <span className="block truncate text-strong font-medium">
              {current ? runName(current) : "No run yet"}
            </span>
            <span className="mt-0.5 block font-mono text-mono-xs text-ink-tertiary">
              {current ? current.id.slice(0, 8) : "start one to see anything"}
            </span>
          </span>
          <Icon name="chevron" size={12} className="shrink-0 rotate-90 text-ink-faint" />
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-50 w-[288px] overflow-hidden rounded-lg border border-hairline bg-canvas shadow-overlay"
            asChild
          >
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={panel}>
              <div className="px-3 py-2 text-caption text-ink-tertiary">Read everything through</div>
              <div className="max-h-[320px] overflow-y-auto">
                {runs.map((run) => (
                  <DropdownMenu.Item key={run.id} asChild>
                    <Link
                      href={`/runs/${run.id}${suffix}`}
                      className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 outline-none transition-colors duration-150 hover:bg-sunken data-[highlighted]:bg-sunken ${
                        run.id === current?.id ? "bg-active" : ""
                      }`}
                    >
                      <span className="min-w-0 grow">
                        <span className="block truncate text-small">{runName(run)}</span>
                        <span className="mt-0.5 block font-mono text-mono-xs text-ink-tertiary">
                          {run.id.slice(0, 8)} · {run.totalEmails ?? "?"} emails
                        </span>
                      </span>
                      {run.processingDone ? null : (
                        <span className="shrink-0 rounded-sm bg-signal-tint px-1.5 py-0.5 text-micro font-medium text-signal">
                          live
                        </span>
                      )}
                    </Link>
                  </DropdownMenu.Item>
                ))}
                {runs.length === 0 ? (
                  <p className="px-3 py-2 text-small text-ink-tertiary">No runs yet.</p>
                ) : null}
              </div>
              <DropdownMenu.Separator className="h-px bg-hairline" />
              <DropdownMenu.Item asChild>
                <Link
                  href="/runs"
                  className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-small outline-none transition-colors duration-150 hover:bg-sunken data-[highlighted]:bg-sunken"
                >
                  <Icon name="table" size={13} className="text-ink-tertiary" />
                  All runs, and start a new one
                </Link>
              </DropdownMenu.Item>
            </motion.div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {current ? <Progress run={current} /> : null}
    </div>
  );
}

/** How far the run in context has got, under its name, so the switcher is also a status. */
function Progress({ run }: { run: RunSummary }) {
  const total = run.totalEmails ?? run.finishedEmails;
  return (
    <div className="mt-2">
      <Bar
        pct={total > 0 ? (run.finishedEmails / total) * 100 : 0}
        tone={run.processingDone ? "var(--ink-faint)" : "var(--signal)"}
        height={3}
      />
      <div className="mt-1.5 text-caption text-ink-tertiary">
        {run.processingDone ? `${total} finished` : `${run.finishedEmails} of ${total} finished`}
      </div>
    </div>
  );
}
