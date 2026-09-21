"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icons";
import { panel } from "@/lib/motion";

/**
 * The headings the seven fields sit under. A heading is a count and a name and
 * nothing else: the rows below it carry the evidence, and a heading that
 * explained itself would be a third voice on a page that already has the
 * sender's and Retina's.
 */

export function Group({ title, count, tone = "plain", children }: { title: string; count: number; tone?: "plain" | "differ" | "review"; children: ReactNode }) {
  const ink = tone === "differ" ? "text-differ" : tone === "review" ? "text-review" : "text-ink";
  return (
    <section className="pt-3">
      <div className="flex h-7 items-center gap-2">
        <h3 className={`text-[13px] font-semibold tracking-[-0.01em] ${ink}`}>{title}</h3>
        <span className="font-mono text-mono-xs text-ink-faint tabular-nums">{count}</span>
      </div>
      {children}
    </section>
  );
}

/** Rows kept out of the way until asked for. The label states what is inside, so opening it is never a guess. */
export function Folded({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="pt-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-7 w-full items-center gap-1.5 text-left text-small text-ink-tertiary transition-colors duration-150 hover:text-ink-secondary"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={panel} className="flex h-3 w-3 shrink-0 items-center justify-center">
          <Icon name="chevron" size={11} />
        </motion.span>
        {label}
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={panel}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
