"use client";

import { motion } from "motion/react";

import { Bar, Panel, PanelFoot, PanelHead } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { RunSummary } from "@/lib/api/runs-schemas";
import { stagger } from "@/lib/motion";

/**
 * A finished run's score: the organisers' own number, and the three components
 * it is made of with what each is worth. The weights come from the scorer
 * rather than from a constant here, because they are the organisers' to change
 * and a page that assumes them would quietly lie after they did.
 *
 * The hero number is Newsreader, which is the one display line this panel gets.
 * Nothing counts up: section 9.
 */

interface ScorePanelProps {
  run: RunSummary;
  className?: string;
}

export function ScorePanel({ run, className = "" }: ScorePanelProps) {
  const submission = run.lastSubmission;
  if (!submission || submission.finalScore === null) return <NotSubmitted run={run} className={className} />;

  const scores = submission.scores;
  const parts = scores
    ? [
        { key: "stage 1", value: scores.stage1MacroF1, weight: scores.weights.stage1, tone: "var(--verdict-match)" },
        { key: "stage 3", value: scores.stage3DefectF1, weight: scores.weights.stage3, tone: "var(--signal)" },
        { key: "end to end", value: scores.endToEndRate, weight: scores.weights.endToEnd, tone: "var(--signal)" },
      ]
    : [];

  return (
    <Panel className={`overflow-hidden ${className}`}>
      <PanelHead title="Score" aside={<span className="text-small text-ink-tertiary">{submission.nEmails} emails</span>} />
      <div className="px-4 pt-1">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-display-lg tracking-[-0.015em] tabular-nums">
            {submission.finalScore.toFixed(4)}
          </span>
          <span className="grow" />
          {submission.forced ? <span className="text-caption text-ink-tertiary">submitted incomplete</span> : null}
        </div>
        <p className="mt-0.5 text-small text-ink-tertiary">The organisers&apos; scorer, on all {submission.nEmails}.</p>
      </div>
      <div className="px-4 pt-3.5">
        {parts.map((part, index) => (
          <motion.div
            key={part.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={stagger(index)}
            className="flex h-[34px] items-center gap-2.5"
          >
            <span className="w-[78px] shrink-0 text-small text-ink-secondary">{part.key}</span>
            <Bar pct={part.value * 100} tone={part.tone} />
            <span className="w-12 shrink-0 text-right font-mono text-mono-sm tabular-nums">{part.value.toFixed(4)}</span>
            <span className="w-10 shrink-0 text-right text-micro text-ink-tertiary tabular-nums">
              {part.weight.toFixed(2)}
            </span>
          </motion.div>
        ))}
      </div>
      <span className="grow" />
      <PanelFoot className="flex items-center gap-2 py-3">
        <span className="text-caption text-ink-tertiary">
          submitted {new Date(submission.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </PanelFoot>
    </Panel>
  );
}

/** Nothing has been sent to the scorer yet. The panel says what would happen, not nothing. */
function NotSubmitted({ run, className }: { run: RunSummary; className: string }) {
  return (
    <Panel className={`overflow-hidden ${className}`}>
      <PanelHead title="Score" aside={<span className="text-small text-ink-tertiary">not submitted</span>} />
      <div className="px-4 pt-1">
        <p className="max-w-[46ch] text-small leading-[18px] text-ink-tertiary">
          The organisers&apos; scorer has not seen this run. Submitting sends one answer per email and returns the three
          components and the weighted number.
        </p>
      </div>
      <span className="grow" />
      <PanelFoot className="flex items-center gap-2 py-3">
        <Button variant="secondary" disabled={!run.processingDone} className="h-8 text-small">
          Submit run
        </Button>
        {run.processingDone ? null : <span className="text-caption text-ink-tertiary">while emails are still moving</span>}
      </PanelFoot>
    </Panel>
  );
}
