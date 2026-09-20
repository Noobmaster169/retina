"use client";

import { Panel, PanelFoot, PanelHead } from "@/components/ui/panel";
import { RunSummary } from "@/lib/api/runs-schemas";
import { formatDuration } from "@/lib/duration";

/**
 * What the run took. This is the run page's own machinery view and the one
 * place in the product where a model name, a token count and a dollar cost are
 * allowed to appear: docs/05-design.md section 11 keeps them off every working
 * screen because they are true and they are not what a documentation clerk
 * needs.
 *
 * It stands where the canvas drew the memory panel. Lessons are phase 11 and
 * the table does not exist, and the handover is explicit that a lesson must
 * not be faked; a panel of real machinery is the honest tenant of that
 * rectangle until then.
 */

interface MachineryPanelProps {
  run: RunSummary;
  className?: string;
}

export function MachineryPanel({ run, className = "" }: MachineryPanelProps) {
  const { llm } = run;
  const perEmail = run.finishedEmails > 0 ? llm.calls / run.finishedEmails : 0;
  const rows: { key: string; value: string; note?: string }[] = [
    { key: "Model calls", value: llm.calls.toLocaleString(), note: `${perEmail.toFixed(1)} an email` },
    { key: "Failed calls", value: llm.failedCalls.toLocaleString(), note: llm.failedCalls === 0 ? "none" : "retried" },
    { key: "Tokens in", value: llm.inputTokens.toLocaleString() },
    { key: "Tokens out", value: llm.outputTokens.toLocaleString() },
    { key: "Settled by the verifier", value: `${Math.round(llm.verifierShare * 100)}%`, note: "of those sorted" },
    { key: "Would have cost", value: `$${llm.costUsd.toFixed(2)}`, note: "nothing is billed" },
  ];

  return (
    <Panel className={`overflow-hidden ${className}`}>
      <PanelHead
        title="What it took"
        aside={<span className="text-small text-ink-tertiary">{formatDuration(run.elapsedMs)}</span>}
      />
      <div className="px-4">
        {rows.map((row) => (
          <div key={row.key} className="flex h-[31px] items-center gap-2.5 border-t border-hairline-faint first:border-t-0">
            <span className="min-w-0 truncate text-small text-ink-secondary">{row.key}</span>
            <span className="grow" />
            {row.note ? <span className="text-caption text-ink-tertiary">{row.note}</span> : null}
            <span className="font-mono text-mono-sm tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
      <span className="grow" />
      <PanelFoot>
        <p className="text-small leading-[18px] text-ink-tertiary">
          Every call is stored with its prompt version, its tokens and what it answered. What this run taught arrives
          with lessons, in phase 11.
        </p>
      </PanelFoot>
    </Panel>
  );
}
