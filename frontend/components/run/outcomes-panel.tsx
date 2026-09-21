"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/ui/icons";
import { Panel, PanelFoot, PanelHead } from "@/components/ui/panel";
import { RunSummary } from "@/lib/api/runs-schemas";

import { parkedReasons, runFlow } from "./flow";
import { FlowDiagram, useFlowLayout } from "./flow-diagram";
import { FlowDots } from "./flow-dots";
import { outcomeBreakdown } from "./outcomes";
import { OutcomesBars } from "./outcomes-bars";
import { SLICE_TONE } from "./outcome-tones";

/**
 * Where the run's emails end up. Every outcome is named in plain English here
 * and by the organisers' own enum in its tooltip: see outcomes.ts.
 *
 * Two readings of one set of numbers. The flow answers "how did the one
 * number at the top become these" and the rows answer "how many of each", and
 * which one a person wants depends on whether they are presenting the run or
 * reading it, so the panel offers both and remembers neither.
 *
 * The flow replaced a ring. A ring took shares of one denominator and said
 * nothing about how an email reached its share: that the 300 needing no check
 * left before the second queue, and that the ones awaiting a draft crossed it
 * and ended without ever being compared. Those are the two facts a reader asks
 * about first, and they are the shape of the picture now rather than a caption
 * under it.
 *
 * `Bars` is not a second styling. A flow diagram cannot be followed by anyone
 * using a screen reader and reads poorly narrow, so the same numbers stay one
 * click away as a list.
 *
 * The body is a container, not a viewport reader. The chat dock takes about
 * four hundred pixels off this panel without the window changing size at all,
 * so a viewport breakpoint would lay out for a width this panel does not have.
 */

type View = "flow" | "bars";

interface OutcomesPanelProps {
  run: RunSummary;
  notComparable: number;
  /** Crossed into the second queue and found no draft to check. Its own slice, or the panel is short by it. */
  awaitingDraft: number;
  /** Work is still moving, which is the only state the dots travel in. */
  live?: boolean;
  /** A paused run is polled and still: every moving thing here is a claim that work is happening. */
  paused?: boolean;
  className?: string;
}

export function OutcomesPanel({ run, notComparable, awaitingDraft, live = false, paused = false, className = "" }: OutcomesPanelProps) {
  const [view, setView] = useState<View>("flow");
  const [lit, setLit] = useState<string | null>(null);
  const { slices, total } = outcomeBreakdown(run, notComparable, awaitingDraft);
  const flow = runFlow(run, notComparable, awaitingDraft);
  const layout = useFlowLayout(flow);
  const reasons = parkedReasons(run, notComparable, awaitingDraft);
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
        {view === "flow" ? (
          <div className="flex flex-col justify-center gap-1 @[560px]:h-full">
            <FlowDiagram flow={flow} runId={run.id} lit={lit} onLight={setLit}>
              <FlowDots layout={layout} running={live && !paused} />
            </FlowDiagram>
            {reasons.length > 0 ? <Reasons reasons={reasons} lit={lit} onLight={setLit} /> : null}
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

/**
 * The four reasons inside `Needs a person`. One band of twenty rather than
 * four of five, because four hairlines would cross the whole picture to reach
 * the foot of the column and none of them could be pointed at.
 */
function Reasons({ reasons, lit, onLight }: { reasons: ReturnType<typeof parkedReasons>; lit: string | null; onLight(id: string | null): void }) {
  return (
    <div
      onMouseEnter={() => onLight("needs-person")}
      onMouseLeave={() => onLight(null)}
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline-faint pt-2.5 transition-opacity duration-150 ${
        lit === null || lit === "needs-person" ? "opacity-100" : "opacity-40"
      }`}
    >
      {/*
        One mark for the group and none on the reasons. All four are the same
        outcome read four ways, so all four carry the review hue, and repeating
        it beside each of them coloured four dots identically and told a reader
        nothing they could not already see from the heading.
      */}
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: SLICE_TONE.review.bar }} />
        <span className="text-caption text-review">Needs a person, by reason</span>
      </span>
      {reasons.map((reason) => (
        <span key={reason.id} title={reason.says} className="flex items-center gap-1.5 text-caption">
          <span className="text-ink-secondary">{reason.label}</span>
          <span className="font-mono text-mono-sm tabular-nums text-ink">{reason.count}</span>
        </span>
      ))}
    </div>
  );
}

/** Two words in a sunken strip. Not a chart-type menu: there are two readings and both fit on screen. */
function ViewToggle({ view, onView }: { view: View; onView: (next: View) => void }) {
  return (
    <span className="flex h-[26px] items-center gap-0.5 rounded-md bg-sunken p-0.5">
      {(["flow", "bars"] as const).map((option) => (
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
