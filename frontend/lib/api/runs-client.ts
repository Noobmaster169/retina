import {
  PromptCatalog,
  type PromptStep,
  RunList,
  type RunAction,
  type RunSubset,
  RunSummary,
} from "./runs-schemas";
import { cached, RUN_SECONDS, RUNS } from "./cached";
import { get, parseAs, refusalMessage, request } from "./transport";

/**
 * A run stream is held open for as long as the run is moving. Under the
 * platform's own ceiling for the route that proxies it, so a stream that has
 * outlived its welcome ends as a close the page can reconnect from rather than
 * as an error page.
 */
const STREAM_TIMEOUT_MS = 280_000;

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

/**
 * Null when there is no such run.
 *
 * Ten seconds, which is a run's shape and not its progress: what moves while a
 * replay runs is the emails, and every screen that draws them polls its own
 * read from the browser rather than this one.
 */
export const getRun = cached(
  "getRun",
  async (id: string): Promise<RunSummary | null> => {
    const path = `/runs/${encodeURIComponent(id)}`;
    const response = await request(path);
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new Error(`Backend GET ${path} → ${response.status}`);
    return parseAs(RunSummary, response, `GET ${path}`);
  },
  { seconds: RUN_SECONDS, tags: [RUNS] },
);

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

/** What a person calls this run. An empty name takes it back to being named by its clock. */
export async function renameRun(id: string, name: string): Promise<RunOutcome> {
  const path = `/runs/${encodeURIComponent(id)}/rename`;
  return runOutcome(await request(path, { method: "POST", body: JSON.stringify({ name }) }), `POST ${path}`);
}

/**
 * Drops a run and everything it produced. A running run is refused with a
 * message rather than stopped from under its workers, so the caller can offer
 * a cancel and try again.
 */
export async function deleteRun(id: string): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const path = `/runs/${encodeURIComponent(id)}`;
  const response = await request(path, { method: "DELETE" });
  if (response.status === 204) return { ok: true };
  return { ok: false, status: response.status, message: await refusalMessage(response) };
}

/** The prompt versions a run may pin, per step. */
export async function listPrompts(): Promise<PromptCatalog> {
  return get(PromptCatalog, "/prompts");
}

/**
 * One run's progress as a stream, for a page that would rather hold a
 * connection than poll two endpoints. The body is handed on unread; what the
 * events mean is `components/run/use-run-live.ts`.
 */
export async function streamRun(id: string, signal?: AbortSignal): Promise<Response> {
  return request(`/runs/${encodeURIComponent(id)}/stream`, {
    headers: { accept: "text/event-stream" },
    timeoutMs: STREAM_TIMEOUT_MS,
    signal,
  });
}
