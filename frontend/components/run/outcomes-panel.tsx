"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icons";
import { Panel, PanelFoot, PanelHead } from "@/components/ui/panel";
import { RunSummary } from "@/lib/api/runs-schemas";

import { parkedReasons, runFlow } from "./flow";
import { FlowDiagram } from "./flow-diagram";
import { useFlowLayout } from "./flow-layout";
import { FlowDots } from "./flow-dots";
import { FlowLegend } from "./flow-legend";
import { outcomeBreakdown } from "./outcomes";
import { OutcomesBars } from "./outcomes-bars";

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
  /** Waiting on a draft. Its own slice, or the panel is short by it. */
  awaitingDraft: number;
  /** Shipping instructions inside `awaitingDraft`. They never entered the second queue. */
  instructionRequests?: number;
  /** Work is still moving, which is the only state the dots travel in. */
  live?: boolean;
  /** A paused run is polled and still: every moving thing here is a claim that work is happening. */
  paused?: boolean;
  className?: string;
}

export function OutcomesPanel({
  run,
  notComparable,
  awaitingDraft,
  instructionRequests = 0,
  live = false,
  paused = false,
  className = "",
}: OutcomesPanelProps) {
  const [view, setView] = useState<View>("flow");
  const [lit, setLit] = useState<string | null>(null);
  /*
   * Keyed on the counts and not on the run.
   *
   * The page polls every two seconds and hands down a new `run` object each
   * time, almost always holding the same numbers. Rebuilding the flow from it
   * on every render made a new object, which made `useFlowLayout`'s memo miss,
   * which ran the whole d3 layout again and handed the dots a new set of paths
   * to follow: every dot in flight jumped back to the start of its band, twice
   * a second, for numbers that had not moved.
   */
  const counted = [
    notComparable,
    awaitingDraft,
    instructionRequests,
    run.outcomes.ok,
    run.outcomes.mismatch,
    ...Object.entries(run.review.byReason).map(([key, count]) => `${key}:${count}`),
  ].join("|");
  const { slices, total } = useMemo(
    () => outcomeBreakdown(run, notComparable, awaitingDraft),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `counted` is every number these read.
    [counted],
  );
  const flow = useMemo(
    () => runFlow(run, notComparable, awaitingDraft, instructionRequests),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as above.
    [counted],
  );
  const reasons = useMemo(
    () => parkedReasons(run, notComparable, awaitingDraft),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as above.
    [counted],
  );
  const layout = useFlowLayout(flow);
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
            <FlowLegend
              endings={flow.nodes.filter((node) => node.column === 2)}
              reasons={reasons}
              runId={run.id}
              lit={lit}
              onLight={setLit}
            />
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
