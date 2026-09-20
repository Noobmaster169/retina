import type { Scoreboard } from "@/lib/api/scoring-schemas";

const CATEGORIES = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"];
const score = (n: number) => n.toFixed(4);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-36">
      <dt className="text-xs uppercase tracking-wide text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-ink-tertiary">{hint}</dd>}
    </div>
  );
}

/** A scoreboard as the organisers' scorer reports it: the three scored stages, escalation, and the confusion matrix. */
export function ScoreboardView({ board }: { board: Scoreboard }) {
  const { stage1, stage3, reliability, end_to_end: e2e, weights } = board;
  return (
    <div>
      <dl className="flex flex-wrap gap-x-10 gap-y-4 border-y border-hairline py-4">
        <Stat label="Final score" value={score(board.final_score)} hint={`over ${board.n_emails} emails`} />
        <Stat label={`Stage 1 macro-F1 (${weights.stage1})`} value={score(stage1.macro_f1)} hint={`accuracy ${score(stage1.accuracy)}`} />
        <Stat
          label={`Stage 3 defect-F1 (${weights.stage3})`}
          value={score(stage3.defect_f1)}
          hint={`precision ${score(stage3.defect_precision)}, recall ${score(stage3.defect_recall)}, ${stage3.doc_total} comparable`}
        />
        <Stat label={`End to end (${weights.end_to_end})`} value={score(e2e.rate)} hint={`${e2e.success} of ${e2e.total} defects fully right`} />
        <Stat
          label="Escalation"
          value={`${score(reliability.escalation_recall)} recall`}
          hint={`${score(reliability.escalation_precision)} precision, ${reliability.pred_review} escalated of ${reliability.gold_review} due`}
        />
      </dl>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <h3 className="text-sm font-semibold">Stage 1 confusion: rows are the truth, columns the answer</h3>
          <table className="mt-2 text-right text-xs tabular-nums">
            <thead className="text-ink-tertiary">
              <tr>
                <th className="py-1 pr-3 text-left font-medium" />
                {CATEGORIES.map((c) => (
                  <th key={c} className="py-1 pr-3 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((actual) => (
                <tr key={actual} className="border-t border-hairline">
                  <th className="py-1 pr-3 text-left font-medium">{actual}</th>
                  {CATEGORIES.map((predicted) => {
                    const n = stage1.confusion[actual]?.[predicted] ?? 0;
                    const tone = n === 0 ? "text-ink-tertiary" : actual === predicted ? "text-ink font-semibold" : "text-fault font-semibold";
                    return (
                      <td key={predicted} className={`py-1 pr-3 ${tone}`}>
                        {n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Escalation by reason: caught of due</h3>
          <ul className="mt-2 text-sm">
            {Object.entries(reliability.per_reason).map(([reason, { total, caught }]) => (
              <li key={reason} className="flex justify-between border-t border-hairline py-1">
                <span>{reason}</span>
                <span className={`tabular-nums ${caught < total ? "text-fault" : "text-ink"}`}>
                  {caught} of {total}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
