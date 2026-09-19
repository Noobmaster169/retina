import { EmailTrace, type LlmCallSummary, LlmCallSummaryList, RunEmailsPage, type RunEmailsQuery, RunLive } from "./trace-schemas";
import { get } from "./transport";

export * from "./trace-schemas";

function queryString(params: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(params).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== "");
  return pairs.length ? `?${new URLSearchParams(pairs.map(([k, v]) => [k, String(v)])).toString()}` : "";
}

export async function listRunEmails(runId: string, query: RunEmailsQuery = {}): Promise<RunEmailsPage> {
  return get(RunEmailsPage, `/runs/${encodeURIComponent(runId)}/emails${queryString({ ...query })}`);
}

/** One email of the run: its stage, how it was classified, the call running now, and every call made. */
export async function getEmailTrace(runId: string, emailId: string): Promise<EmailTrace> {
  return get(EmailTrace, `/runs/${encodeURIComponent(runId)}/emails/${encodeURIComponent(emailId)}/trace`);
}

/** The run's model calls running right now, with what each has written so far. */
export async function getRunLive(runId: string): Promise<RunLive> {
  return get(RunLive, `/runs/${encodeURIComponent(runId)}/live`);
}

/** The run's newest calls without their text, newest first; with `after`, only those newer than that call id. */
export async function listRunCalls(runId: string, after?: number): Promise<LlmCallSummary[]> {
  return (await get(LlmCallSummaryList, `/runs/${encodeURIComponent(runId)}/calls${queryString({ after })}`)).calls;
}
