import { LlmCallList, type LlmCall, RunEmailsPage, type RunEmailsQuery } from "./trace-schemas";
import { get } from "./transport";

export * from "./trace-schemas";

function queryString(params: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(params).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== "");
  return pairs.length ? `?${new URLSearchParams(pairs.map(([k, v]) => [k, String(v)])).toString()}` : "";
}

export async function listRunEmails(runId: string, query: RunEmailsQuery = {}): Promise<RunEmailsPage> {
  return get(RunEmailsPage, `/runs/${encodeURIComponent(runId)}/emails${queryString({ ...query })}`);
}

/** Every model call made for one email of the run, oldest first. */
export async function listEmailCalls(runId: string, emailId: string): Promise<LlmCall[]> {
  const path = `/runs/${encodeURIComponent(runId)}/emails/${encodeURIComponent(emailId)}/calls`;
  return (await get(LlmCallList, path)).calls;
}

/** The run's newest calls, newest first; with `after`, only those newer than that call id. */
export async function listRunCalls(runId: string, after?: number): Promise<LlmCall[]> {
  return (await get(LlmCallList, `/runs/${encodeURIComponent(runId)}/calls${queryString({ after })}`)).calls;
}
