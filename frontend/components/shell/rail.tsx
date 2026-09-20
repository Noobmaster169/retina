"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { Icon, Mark } from "@/components/ui/icons";
import { panel, quick, spring } from "@/lib/motion";

import { DESTINATIONS, type NavCounts } from "./nav";

/**
 * The left rail, 232px, collapsing to 56px of glyphs. Every page must work at
 * both widths, so the collapse is state on the shell and not a route.
 */

interface RailProps {
  open: boolean;
  onToggle: () => void;
  active: string;
  counts: NavCounts;
  /** What is pinned for the current context, then memory, then dependency health. Hidden when collapsed. */
  children?: ReactNode;
}

export function Rail({ open, onToggle, active, counts, children }: RailProps) {
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

      <div className={open ? "px-3 pt-1.5" : "flex flex-col items-center pt-1.5"}>
        {DESTINATIONS.map((destination) => (
          <Link
            key={destination.key}
            href={destination.href}
            aria-label={open ? undefined : destination.label}
            aria-current={destination.key === active ? "page" : undefined}
            title={open ? undefined : destination.label}
            className={`flex items-center rounded-md transition-colors duration-150 hover:bg-active ${
              open ? "h-[34px] gap-2.5 px-2.5" : "mb-1 h-[34px] w-[34px] justify-center"
            } ${destination.key === active ? "bg-active" : ""}`}
          >
            <Icon
              name={destination.icon}
              className={`shrink-0 ${destination.key === active ? "text-ink" : "text-ink-tertiary"}`}
            />
            {open ? (
              <>
                <span
                  className={`whitespace-nowrap text-heading ${
                    destination.key === active ? "font-medium text-ink" : "font-normal text-ink-secondary"
                  }`}
                >
                  {destination.label}
                </span>
                <span className="grow" />
                <span className="font-mono text-mono-sm text-ink-tertiary">
                  {counts[destination.key] ?? (destination.planned ? "" : "")}
                </span>
              </>
            ) : null}
          </Link>
        ))}
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
            {children}
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

/** A titled block inside the rail: pinned prompts, memory, dependency health. */
export function RailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-[18px] pb-1.5 pt-3">
      <div className="pb-1.5 text-small font-medium text-ink-tertiary">{title}</div>
      {children}
    </div>
  );
}
