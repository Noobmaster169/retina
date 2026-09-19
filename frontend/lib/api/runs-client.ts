import {
  type PromptStep,
  RunList,
  type RunAction,
  type RunSubset,
  RunSummary,
} from "./runs-schemas";
import { get, parseAs, refusalMessage, request } from "./transport";

export * from "./runs-schemas";

/**
 * `source` is deliberately absent: the backend defaults it to the only source
 * there is, so sending it would be a second place to change when a second one
 * arrives.
 */
export interface CreateRunInput {
  /** 0 is a burst: everything is enqueued at once. */
  ratePerSecond?: number;
  limit?: number;
  emailIds?: string[];
  subset?: RunSubset;
  /** A prompt version per step, e.g. { classify: "v4" }. Else the active one. */
  promptSet?: Partial<Record<PromptStep, string>>;
  /** A proxy alias per step, for the model comparison. Else sonnet. */
  models?: Partial<Record<PromptStep, string>>;
}

/** A refusal (400, 404, 409, 503) comes back as a message, because the page shows it inline. */
export type RunOutcome = { ok: true; run: RunSummary } | { ok: false; status: number; message: string };

async function runOutcome(response: Response, what: string): Promise<RunOutcome> {
  if (!response.ok) return { ok: false, status: response.status, message: await refusalMessage(response) };
  return { ok: true, run: await parseAs(RunSummary, response, what) };
}

export async function listRuns(): Promise<RunList> {
  return get(RunList, "/runs");
}

/** Null when there is no such run. */
export async function getRun(id: string): Promise<RunSummary | null> {
  const path = `/runs/${encodeURIComponent(id)}`;
  const response = await request(path);
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error(`Backend GET ${path} → ${response.status}`);
  return parseAs(RunSummary, response, `GET ${path}`);
}

export async function createRun(input: CreateRunInput): Promise<RunOutcome> {
  const response = await request("/runs", { method: "POST", body: JSON.stringify(input) });
  return runOutcome(response, "POST /runs");
}

async function controlRun(id: string, action: RunAction): Promise<RunOutcome> {
  const path = `/runs/${encodeURIComponent(id)}/${action}`;
  return runOutcome(await request(path, { method: "POST" }), `POST ${path}`);
}

export async function pauseRun(id: string): Promise<RunOutcome> {
  return controlRun(id, "pause");
}

export async function resumeRun(id: string): Promise<RunOutcome> {
  return controlRun(id, "resume");
}

export async function cancelRun(id: string): Promise<RunOutcome> {
  return controlRun(id, "cancel");
}
