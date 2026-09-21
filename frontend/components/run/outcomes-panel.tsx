"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/ui/icons";
import { Panel, PanelFoot, PanelHead } from "@/components/ui/panel";
import { RunSummary } from "@/lib/api/runs-schemas";

import { outcomeBreakdown } from "./outcomes";
import { OutcomesBars } from "./outcomes-bars";
import { OutcomesLegend } from "./outcomes-legend";
import { OutcomesPie } from "./outcomes-pie";

/**
 * Where the run's emails end up. Every outcome is named in plain English here
 * and by the organisers' own enum in its tooltip: see outcomes.ts.
 *
 * Two readings of one set of numbers. The circle answers "what mostly
 * happened" in a glance and the rows answer "how many of each", and which one
 * a person wants depends on whether they are presenting the run or reading
 * it, so the panel offers both and remembers neither.
 *
 * The body is a container, not a viewport reader. The chat dock takes about
 * four hundred pixels off this panel without the window changing size at all,
 * so a viewport breakpoint would have laid the wide version out inside the
 * narrow panel and squeezed the legend down to a column of bare percentages.
 */

type View = "pie" | "bars";

interface OutcomesPanelProps {
  run: RunSummary;
  notComparable: number;
  className?: string;
}

export function OutcomesPanel({ run, notComparable, className = "" }: OutcomesPanelProps) {
  const [view, setView] = useState<View>("pie");
  const [lit, setLit] = useState<string | null>(null);
  const { slices, total } = outcomeBreakdown(run, notComparable);
  const open = run.review.open;

  return (
    <Panel className={`overflow-hidden ${className}`}>
      <PanelHead
        title="Where they end up"
        aside={
          <span className="flex items-center gap-2.5">
            <span className="text-small text-ink-tertiary">
              {run.processingDone ? `all ${total} finished` : `${run.finishedEmails} of ${run.totalEmails ?? total} finished`}
            </span>
            <ViewToggle view={view} onView={setView} />
          </span>
        }
      />
      <div className="@container min-h-0 grow overflow-y-auto px-4 pt-1">
        {view === "pie" ? (
          // Stacked while it is narrow, side by side once there is room, and
          // centred either way: a 184px ring alone at the top of a panel a
          // thousand pixels wide reads as a page that failed to load.
          <div className="flex flex-col items-center justify-center gap-4 @[560px]:h-full @[560px]:flex-row @[560px]:gap-8">
            <OutcomesPie slices={slices} total={total} lit={lit} onLight={setLit} />
            <OutcomesLegend slices={slices} lit={lit} onLight={setLit} />
          </div>
        ) : (
          <OutcomesBars slices={slices} lit={lit} onLight={setLit} />
        )}
      </div>
      {open > 0 ? (
        // Only when somebody is needed. "Nobody is needed" was a control that
        // led to an empty list, on the one screen whose whole job is to say
        // what is left to do.
        <PanelFoot className="py-3">
          <Link
            href={`/runs/${run.id}/inbox?filter=needs-you`}
            className="flex h-[34px] items-center gap-2 rounded-md bg-review-tint px-3 transition-opacity duration-150 hover:opacity-80"
          >
            <span className="text-strong font-medium text-review">
              {open} {open === 1 ? "email needs" : "emails need"} a person
            </span>
            <span className="grow" />
            <Icon name="chevron" size={12} className="text-review" />
          </Link>
        </PanelFoot>
      ) : null}
    </Panel>
  );
}

/** Two words in a sunken strip. Not a chart-type menu: there are two readings and both fit on screen. */
function ViewToggle({ view, onView }: { view: View; onView: (next: View) => void }) {
  return (
    <span className="flex h-[26px] items-center gap-0.5 rounded-md bg-sunken p-0.5">
      {(["pie", "bars"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          onClick={() => onView(option)}
          className={`h-[22px] rounded-[5px] px-2 text-caption font-medium capitalize transition-colors duration-150 ${
            view === option ? "bg-canvas text-ink shadow-[0_0_0_1px_var(--hairline)]" : "text-ink-tertiary hover:text-ink-secondary"
          }`}
        >
          {option}
        </button>
      ))}
    </span>
  );
}
