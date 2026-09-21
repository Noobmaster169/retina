"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { Icon, Mark } from "@/components/ui/icons";
import type { RunSummary } from "@/lib/api/runs-schemas";
import { quick, spring } from "@/lib/motion";

import { hrefFor, type NavAlerts, type NavCounts, RAIL_DESTINATIONS } from "./nav";
import { RunSwitcher } from "./run-switcher";

/**
 * The left rail, 232px, collapsing to 56px of glyphs. It is the same on every
 * screen: the run in context and the destinations.
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
  /** What is waiting on a person, per destination. Tinted, and absent where nothing is. */
  alerts: NavAlerts;
  /** The run everything below is read through, and every run there is to switch to. */
  current: RunSummary | null;
  runs: RunSummary[];
}

export function Rail({ open, onToggle, active, counts, alerts, current, runs }: RailProps) {
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
          const waiting = alerts[destination.key] ?? 0;
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
                  {waiting > 0 ? (
                    <span
                      title={`${waiting} waiting for a person`}
                      className="rounded-xs bg-review-tint px-1 font-mono text-mono-sm text-review tabular-nums"
                    >
                      {waiting}
                    </span>
                  ) : null}
                </>
              ) : null}
            </Link>
          );
        })}
      </div>

      {open ? null : (
        <div className="flex grow flex-col items-center justify-end pb-3.5">
          <CollapseButton open={false} onClick={onToggle} />
        </div>
      )}
    </motion.nav>
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
