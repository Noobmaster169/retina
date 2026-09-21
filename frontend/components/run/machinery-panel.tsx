"use client";

import { Panel, PanelHead } from "@/components/ui/panel";
import { RunSummary } from "@/lib/api/runs-schemas";
import { formatDuration } from "@/lib/duration";

import { CostReveal } from "./cost-reveal";
import { planCost } from "./plan-cost";

/**
 * What the run took. This is the run page's own machinery view and the one
 * place in the product where a model name, a token count and a dollar cost are
 * allowed to appear: docs/05-design.md section 11 keeps them off every working
 * screen because they are true and they are not what a documentation clerk
 * needs.
 *
 * Tiles rather than a list of rows. Six rows of label-dots-number filled the
 * top third of the panel and left the rest of it blank, which read as a panel
 * still loading; the same six as tiles fill the width, and the cost takes what
 * is left instead of the panel ending in air.
 *
 * The cost is the one worth looking at, so it is the only one that opens.
 */

interface MachineryPanelProps {
  run: RunSummary;
  className?: string;
}

/** A million tokens does not need seven digits in a tile; the title carries the exact figure. */
function short(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

export function MachineryPanel({ run, className = "" }: MachineryPanelProps) {
  const { llm } = run;
  const perEmail = run.finishedEmails > 0 ? llm.calls / run.finishedEmails : 0;
  const cost = planCost(llm.inputTokens + llm.outputTokens, llm.costUsd, run.finishedEmails);

  const tiles: { key: string; value: string; note?: string; exact?: string }[] = [
    { key: "Model calls", value: llm.calls.toLocaleString(), note: `${perEmail.toFixed(1)} an email` },
    { key: "Failed", value: llm.failedCalls.toLocaleString(), note: llm.failedCalls === 0 ? "none" : "retried" },
    { key: "Tokens in", value: short(llm.inputTokens), exact: llm.inputTokens.toLocaleString() },
    { key: "Tokens out", value: short(llm.outputTokens), exact: llm.outputTokens.toLocaleString() },
    { key: "Verifier", value: `${Math.round(llm.verifierShare * 100)}%`, note: "of those sorted" },
    { key: "Took", value: formatDuration(run.elapsedMs) },
  ];

  return (
    <Panel className={`overflow-hidden ${className}`}>
      <PanelHead title="What it took" />
      <div className="flex min-h-0 grow flex-col gap-2 px-4 pb-4">
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((tile) => (
            <div key={tile.key} className="rounded-lg border border-hairline px-3 py-2" title={tile.exact}>
              <div className="truncate text-caption text-ink-tertiary">{tile.key}</div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[15px] font-medium tabular-nums text-ink">{tile.value}</span>
                {tile.note ? <span className="min-w-0 truncate text-caption text-ink-tertiary">{tile.note}</span> : null}
              </div>
            </div>
          ))}
        </div>
        <CostReveal cost={cost} />
      </div>
    </Panel>
  );
}
