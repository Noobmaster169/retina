import { Bar, Panel, PanelHead } from "@/components/ui/panel";
import type { Scoreboard } from "@/lib/api/scoring-schemas";

/**
 * A scoreboard as the organisers' scorer reports it. Built from the same
 * panels, bars and scale as every other surface: this page predates the design
 * language and was the last thing still drawn its own way.
 *
 * The confusion matrix is the one grid of numbers in the product, and it earns
 * it: rows are the truth, columns the answer, and the only coloured cell is one
 * off the diagonal, which is a category the run got wrong.
 */

const CATEGORIES = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"];
const score = (n: number) => n.toFixed(4);

export function ScoreboardView({ board }: { board: Scoreboard }) {
  const { stage1, stage3, reliability, end_to_end: e2e, weights } = board;
  const parts = [
    { key: "stage 1", label: "macro F1 over the five categories", value: stage1.macro_f1, weight: weights.stage1 },
    { key: "stage 3", label: "defect F1 over the comparable pairs", value: stage3.defect_f1, weight: weights.stage3 },
    { key: "end to end", label: "every check right on one email", value: e2e.rate, weight: weights.end_to_end },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHead
          title="Final score"
          aside={<span className="text-small text-ink-tertiary">over {board.n_emails} emails</span>}
        />
        <div className="px-4 pb-1">
          <span className="font-display text-display-lg tracking-[-0.015em] tabular-nums">{score(board.final_score)}</span>
        </div>
        <div className="px-4 pb-3">
          {parts.map((part) => (
            <div key={part.key} className="flex h-[34px] items-center gap-2.5">
              <span className="w-[78px] shrink-0 text-small text-ink-secondary">{part.key}</span>
              <span className="w-[230px] shrink-0 truncate text-caption text-ink-tertiary">{part.label}</span>
              <Bar pct={part.value * 100} tone="var(--signal)" />
              <span className="w-12 shrink-0 text-right font-mono text-mono-sm tabular-nums">{score(part.value)}</span>
              <span className="w-10 shrink-0 text-right text-micro tabular-nums text-ink-tertiary">
                {part.weight.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="flex flex-wrap gap-4">
        <Panel className="min-w-[420px] grow basis-0">
          <PanelHead title="Stage 1" note="rows are the truth, columns the answer" />
          <div className="overflow-x-auto px-4 pb-4">
            <table className="text-right font-mono text-mono-xs tabular-nums">
              <thead>
                <tr className="text-ink-tertiary">
                  <th className="py-1 pr-3 text-left font-normal" />
                  {CATEGORIES.map((category) => (
                    <th key={category} className="py-1 pr-3 font-normal">
                      {category}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((actual) => (
                  <tr key={actual} className="border-t border-hairline-faint">
                    <th className="py-1 pr-3 text-left font-normal text-ink-secondary">{actual}</th>
                    {CATEGORIES.map((predicted) => {
                      const n = stage1.confusion[actual]?.[predicted] ?? 0;
                      const tone =
                        n === 0 ? "text-ink-faint" : actual === predicted ? "text-ink" : "bg-fault-tint text-fault";
                      return (
                        <td key={predicted} className={`px-1.5 py-1 ${tone}`}>
                          {n}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2.5 max-w-[46ch] text-caption leading-[17px] text-ink-tertiary">
              Accuracy {score(stage1.accuracy)}. Anything off the diagonal is an email sorted into the wrong category.
            </p>
          </div>
        </Panel>

        <Panel className="min-w-[320px] grow basis-0">
          <PanelHead
            title="Escalation"
            aside={
              <span className="font-mono text-mono-sm tabular-nums text-ink-tertiary">
                {score(reliability.escalation_recall)}
              </span>
            }
          />
          <div className="px-4">
            {Object.entries(reliability.per_reason).map(([reason, { total, caught }]) => (
              <div key={reason} className="flex h-[31px] items-center gap-2.5 border-t border-hairline-faint">
                <span className="w-[140px] shrink-0 font-mono text-micro text-review">{reason}</span>
                <Bar pct={total === 0 ? 0 : (caught / total) * 100} tone="var(--verdict-review)" />
                <span
                  className={`w-14 shrink-0 text-right text-small tabular-nums ${caught < total ? "text-fault" : "text-ink"}`}
                >
                  {caught} of {total}
                </span>
              </div>
            ))}
          </div>
          <p className="border-t border-hairline px-4 py-3 text-caption leading-[17px] text-ink-tertiary">
            {reliability.pred_review} escalated of {reliability.gold_review} due, at{" "}
            {score(reliability.escalation_precision)} precision. Stage 3 saw {stage3.doc_total} comparable pairs.
          </p>
        </Panel>
      </div>
    </div>
  );
}
