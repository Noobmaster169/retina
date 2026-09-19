import { z } from "zod";

import { EvalReport, SubmissionList } from "./scoring-schemas";
import { get, request } from "./transport";

export * from "./scoring-schemas";

/**
 * Submitting a run and reading the dev-only eval report.
 *
 * The backend's scoreboard is a deep, snake_case object straight from the
 * organisers' scorer. Only the headline numbers below are ever rendered, so
 * only they are mirrored: zod drops the rest, and the depth the frontend does
 * not read cannot drift against it. Mirrors backend/src/contracts.scoring.ts.
 */
const ScoreboardHeadline = z.object({
  stage1: z.object({ macro_f1: z.number() }),
  end_to_end: z.object({ rate: z.number() }),
  final_score: z.number(),
  n_emails: z.number(),
});
export type ScoreboardHeadline = z.infer<typeof ScoreboardHeadline>;

const SubmitResult = z.object({ finalScore: z.number() });

const SubmitRefusal = z.object({
  error: z.string().optional(),
  incomplete: z.array(z.string()).optional(),
  /**
   * On a 409, whether `force` would get past this refusal: a run still ingesting
   * or holding unfinished emails can be forced, one whose earlier submission is
   * still being scored cannot.
   */
  forcible: z.boolean().optional(),
});

export type SubmitOutcome =
  | { ok: true; finalScore: number }
  | { ok: false; status: number; message: string; incomplete?: string[]; forcible?: boolean };

export async function submitRun(id: string, force: boolean): Promise<SubmitOutcome> {
  const response = await request(`/runs/${encodeURIComponent(id)}/submit?force=${force}`, {
    method: "POST",
    timeoutMs: 60_000,
  });
  const body: unknown = await response.json().catch(() => null);
  const scored = SubmitResult.safeParse(body);
  if (response.ok && scored.success) return { ok: true, finalScore: scored.data.finalScore };

  const refusal = SubmitRefusal.safeParse(body);
  return {
    ok: false,
    status: response.status,
    message: (refusal.success ? refusal.data.error : undefined) ?? `Backend returned ${response.status}`,
    incomplete: refusal.success ? refusal.data.incomplete : undefined,
    forcible: refusal.success ? refusal.data.forcible : undefined,
  };
}


/** Null where the backend has no answer key, which is everywhere but a dev machine. */
export async function getEvalReport(id: string): Promise<EvalReport | null> {
  const path = `/eval/runs/${encodeURIComponent(id)}`;
  const response = await request(path, { timeoutMs: 30_000 });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Backend GET ${path} → ${response.status}`);
  const parsed = EvalReport.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error(`GET ${path} answered outside the contract`);
  return parsed.data;
}

/** Every submission of the run to the organisers' scorer, newest first, with its full scoreboard. */
export async function listSubmissions(id: string): Promise<SubmissionList> {
  return get(SubmissionList, `/runs/${encodeURIComponent(id)}/submissions`);
}
