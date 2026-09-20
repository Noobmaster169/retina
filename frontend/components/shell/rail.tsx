"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { Icon, Mark } from "@/components/ui/icons";
import { checkDetail, DEPENDENCIES, DEPENDENCY_LABELS, type HealthReport } from "@/lib/api/queues-schemas";
import type { RunSummary } from "@/lib/api/runs-schemas";
import { panel, quick, spring } from "@/lib/motion";

import { hrefFor, type NavCounts, RAIL_DESTINATIONS } from "./nav";
import { RunSwitcher } from "./run-switcher";

/**
 * The left rail, 232px, collapsing to 56px of glyphs. It is the same on every
 * screen: the run in context, the destinations, what that run pinned, and the
 * state of everything the pipeline depends on.
 *
 * Same everywhere is the point. A rail that gained a block on one route and
 * lost it on the next made navigating feel like changing product, so nothing
 * here is passed in per page except which destination is current.
 */

interface RailProps {
  open: boolean;
  onToggle: () => void;
  active: string;
  counts: NavCounts;
  /** The run everything below is read through, and every run there is to switch to. */
  current: RunSummary | null;
  runs: RunSummary[];
  /** Null while the first health read is in flight, or when it failed. */
  health: HealthReport | null;
}

export function Rail({ open, onToggle, active, counts, current, runs, health }: RailProps) {
  return (
    <motion.nav
      initial={false}
      animate={{ width: open ? 232 : 56 }}
      transition={spring}
      className="flex shrink-0 flex-col overflow-hidden border-r border-hairline bg-surface"
      aria-label="Retina"
    >
      <div className={`flex h-14 shrink-0 items-center gap-2.5 ${open ? "px-[18px]" : "justify-center px-0"}`}>
        <Mark size={18} className="shrink-0 text-ink" />
        <AnimatePresence initial={false}>
          {open ? (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={quick}
              className="flex min-w-0 grow items-center gap-2 whitespace-nowrap"
            >
              <span className="text-[14px] font-semibold tracking-[-0.01em]">Retina</span>
              <span className="text-small text-ink-tertiary">SDOC</span>
            </motion.span>
          ) : null}
        </AnimatePresence>
        {open ? <CollapseButton open onClick={onToggle} /> : null}
      </div>

      <RunSwitcher current={current} runs={runs} open={open} />
      <div className={`h-px bg-hairline ${open ? "mx-[18px] mt-2" : "mx-3"}`} />

      <div className={open ? "px-3 pt-2" : "flex flex-col items-center pt-2"}>
        {RAIL_DESTINATIONS.map((destination) => {
          const here = destination.key === active;
          return (
            <Link
              key={destination.key}
              href={hrefFor(destination, current?.id ?? null)}
              aria-label={open ? undefined : destination.label}
              aria-current={here ? "page" : undefined}
              title={open ? undefined : destination.label}
              className={`flex items-center rounded-md transition-colors duration-150 hover:bg-active ${
                open ? "h-[34px] gap-2.5 px-2.5" : "mb-1 h-[34px] w-[34px] justify-center"
              } ${here ? "bg-active" : ""}`}
            >
              <Icon name={destination.icon} className={`shrink-0 ${here ? "text-ink" : "text-ink-tertiary"}`} />
              {open ? (
                <>
                  <span
                    className={`whitespace-nowrap text-heading ${here ? "font-medium text-ink" : "font-normal text-ink-secondary"}`}
                  >
                    {destination.label}
                  </span>
                  <span className="grow" />
                  <span className="font-mono text-mono-sm text-ink-tertiary">{counts[destination.key] ?? ""}</span>
                </>
              ) : null}
            </Link>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={panel}
            className="flex min-h-0 grow flex-col"
          >
            <Pinned run={current} />
            <span className="grow" />
            <Dependencies health={health} />
          </motion.div>
        ) : (
          <div className="flex grow flex-col items-center justify-end pb-3.5">
            <CollapseButton open={false} onClick={onToggle} />
          </div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

/** What the run in context pinned. A run from before pinning shows what that means instead of an empty block. */
function Pinned({ run }: { run: RunSummary | null }) {
  const pinned = run
    ? Object.entries(run.promptSet).flatMap(([step, prompt]) => (prompt ? [{ step, version: prompt.version }] : []))
    : [];
  return (
    <div className="px-[18px] pb-1.5 pt-3.5">
      <div className="pb-1.5 text-small font-medium text-ink-tertiary">Pinned for this run</div>
      {pinned.length > 0 ? (
        pinned.map((prompt) => (
          <div key={prompt.step} className="flex h-[25px] items-center">
            <span className="font-mono text-mono-sm text-ink-tertiary">{prompt.step}</span>
            <span className="grow" />
            <span className="font-mono text-mono-sm text-ink-secondary">{prompt.version}</span>
          </div>
        ))
      ) : (
        <p className="text-caption leading-[17px] text-ink-tertiary">
          {run
            ? "Nothing pinned. Each step ran whichever prompt was active when it reached it."
            : "A run pins a prompt version per step, and the worker loads exactly that."}
        </p>
      )}
    </div>
  );
}

/**
 * The state of everything the pipeline depends on, as chips. A chip carries
 * its state in its label and its tint: a coloured dot beside a word was the
 * single most common note across four rounds of review.
 */
function Dependencies({ health }: { health: HealthReport | null }) {
  return (
    <div className="border-t border-hairline px-[18px] py-3.5">
      <div className="text-small font-medium text-ink-tertiary">Dependencies</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {health === null ? (
          <span className="text-caption text-ink-tertiary">Reading.</span>
        ) : (
          DEPENDENCIES.map((key) => {
            const down = health.checks[key].status === "down";
            const detail = checkDetail(health, key);
            return (
              <span
                key={key}
                className={`inline-flex h-[22px] items-center rounded-sm px-2 font-mono text-mono-xs transition-colors duration-150 ${
                  down ? "bg-fault-tint text-fault" : "bg-sunken text-ink-secondary"
                }`}
                title={
                  down
                    ? `${DEPENDENCY_LABELS[key]} is not answering`
                    : [`${DEPENDENCY_LABELS[key]} is up`, detail].filter(Boolean).join(", ")
                }
              >
                {DEPENDENCY_LABELS[key]}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

function CollapseButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? "Collapse the sidebar" : "Open the sidebar"}
      aria-expanded={open}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-ink-faint transition-colors duration-150 hover:bg-active hover:text-ink-secondary"
    >
      <Icon name="panel" size={14} />
    </button>
  );
}
