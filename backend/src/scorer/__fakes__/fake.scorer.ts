import type { Scoreboard, SubmissionRow } from "../../contracts";
import { sleep } from "../../lib/time";
import type { Scorer } from "../scorer";

export function scoreboardOf(finalScore: number, nEmails: number): Scoreboard {
  return {
    stage1: { accuracy: finalScore, macro_f1: finalScore, rule_pct: 0, per: {}, confusion: {} },
    stage3: { defect_precision: 0, defect_recall: 0, defect_f1: 0, field_f1: 0, exact_match_rate: 0, doc_total: 0 },
    reliability: { escalation_recall: 0, escalation_precision: 0, escalation_f1: 0, gold_review: 0, pred_review: 0, per_reason: {} },
    end_to_end: { success: 0, total: 0, rate: 0 },
    weights: { stage1: 0.3, stage3: 0.2, end_to_end: 0.5 },
    final_score: finalScore,
    n_emails: nEmails,
  };
}

export class FakeScorer implements Scorer {
  readonly received: Record<string, SubmissionRow>[] = [];
  failWith: Error | undefined;
  /** How long scoring takes, for tests of what happens meanwhile. */
  delayMs = 0;

  constructor(private readonly finalScore = 0.42) {}

  async score(payload: Record<string, SubmissionRow>): Promise<Scoreboard> {
    if (this.delayMs > 0) await sleep(this.delayMs);
    if (this.failWith) throw this.failWith;
    this.received.push(payload);
    return scoreboardOf(this.finalScore, Object.keys(payload).length);
  }
}
