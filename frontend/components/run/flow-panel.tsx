"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/ui/icons";
import { Panel, PanelFoot, PanelHead } from "@/components/ui/panel";
import type { RunQueuesView } from "@/lib/api/queues-schemas";
import type { RunSummary } from "@/lib/api/runs-schemas";

import { parkedReasons, runFlow } from "./flow";
import { FlowDiagram, useFlowLayout } from "./flow-diagram";
import { FlowDots } from "./flow-dots";
import { outcomeBreakdown } from "./outcomes";
import { OutcomesBars } from "./outcomes-bars";
import { SLICE_TONE } from "./outcome-tones";

/**
 * How the work moves, and where it ends: one picture instead of two.
 *
 * It replaced a strip of six stage cards and a ring beside it. The strip
 * counted emails at each step and the ring took shares of the finished ones,
 * and between them neither answered the question a person asks first, which is
 * how the one number at the top becomes the several at the bottom.
 *
 * What the strip did say and a flow cannot is what the machine is doing this
 * second: how many slots are busy, how much is queued, whether a queue is held.
 * That is one line above the diagram now rather than six cards, because it is
 * one sentence of fact and it changes every second.
 *
 * `Bars` is not an alternative styling. A flow diagram cannot be read by
 * anyone using a screen reader and it is poor on a narrow screen, so the same
 * numbers stay one click away as a list, which is the fallback the chart
 * guidance asks for.
 */

type View = "flow" | "bars";

interface FlowPanelProps {
  run: RunSummary;
  /** Null when the backend cannot reach its queues; the flow still draws from what the run knows. */
  queues: RunQueuesView | null;
  /** Work is still arriving or moving. */
  live: boolean;
  /** Paused runs are still polled, because someone else may resume one, but nothing on them may go on moving. */
  paused: boolean;
  className?: string;
}

export function FlowPanel({ run, queues, live, paused, className = "" }: FlowPanelProps) {
  // Every moving thing on this page is a claim that work is happening, and
  // after a pause none is.
  const running = live && !paused;
  const [view, setView] = useState<View>("flow");
  const [lit, setLit] = useState<string | null>(null);

  const notComparable = queues?.handoff.notComparable ?? 0;
  const awaitingDraft = queues?.handoff.awaitingDraft ?? 0;
  const flow = runFlow(run, notComparable, awaitingDraft);
  const layout = useFlowLayout(flow);
  const { slices } = outcomeBreakdown(run, notComparable, awaitingDraft);
  const reasons = parkedReasons(run, notComparable, awaitingDraft);
  const open = run.review.open;

  return (
    <Panel className={`overflow-hidden ${className}`}>
      <PanelHead
        title="How the work moves"
        aside={
          <span className="flex items-center gap-2.5">
            <span className="text-small text-ink-tertiary">
              {run.processingDone ? `all ${flow.total} finished` : `${run.finishedEmails} of ${run.totalEmails ?? flow.total} finished`}
            </span>
            <ViewToggle view={view} onView={setView} />
          </span>
        }
      />

      <MachineLine queues={queues} live={live} paused={paused} />

      <div className="min-h-0 grow overflow-y-auto px-4 pb-2">
        {view === "flow" ? (
          <>
            <FlowDiagram flow={flow} lit={lit} onLight={setLit}>
              <FlowDots layout={layout} running={running} />
            </FlowDiagram>
            {reasons.length > 0 ? <Reasons reasons={reasons} lit={lit} onLight={setLit} /> : null}
          </>
        ) : (
          <OutcomesBars slices={slices} lit={lit} onLight={setLit} />
        )}
      </div>

      {open > 0 ? (
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

/** What the machine is doing this second. One line, because it is one fact and it changes every second. */
function MachineLine({ queues, live, paused }: { queues: RunQueuesView | null; live: boolean; paused: boolean }) {
  if (!queues) return null;
  return <p className="px-4 pb-1 text-small text-ink-tertiary">{machineWords(queues, live, paused)}</p>;
}

/** The six stage cards said this in six boxes. It is one sentence of fact, and it changes every second. */
function machineWords(queues: RunQueuesView, live: boolean, paused: boolean): string {
  if (paused) return "Paused. Both queues keep what they were given and start nothing new.";
  if (queues.compare.heldUntil !== null) return "Sorting is unaffected. Checking is held, so the emails between them pile up.";
  if (!live) return "Both queues drained.";
  return `Sorting ${queues.classify.active} of ${queues.classify.concurrency}, checking ${queues.compare.active} of ${queues.compare.concurrency}, ${queues.compare.waiting} waiting to be checked.`;
}

/** The four reasons inside `Needs a person`, which are too small to be bands of their own. */
function Reasons({ reasons, lit, onLight }: { reasons: ReturnType<typeof parkedReasons>; lit: string | null; onLight(id: string | null): void }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline-faint pt-2.5">
      <span className="text-caption text-ink-tertiary">Needs a person, by reason</span>
      {reasons.map((reason) => (
        <span
          key={reason.id}
          title={reason.says}
          onMouseEnter={() => onLight("needs-person")}
          onMouseLeave={() => onLight(null)}
          className={`flex items-center gap-1.5 text-caption transition-opacity duration-150 ${lit === null || lit === "needs-person" ? "opacity-100" : "opacity-40"}`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: SLICE_TONE[reason.tone].bar }} />
          <span className="text-ink-secondary">{reason.label}</span>
          <span className="font-mono text-mono-sm tabular-nums text-ink">{reason.count}</span>
        </span>
      ))}
    </div>
  );
}

/** Two readings of one set of numbers, one of which a screen reader can follow. */
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
