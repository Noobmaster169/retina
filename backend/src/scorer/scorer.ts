import { Scoreboard, type SubmissionRow } from "../contracts";
import { RetryableError, TerminalError, UpstreamError } from "../lib/errors";

/** The organisers' scorer: a submission in, a scoreboard out. It holds the answer key; this side never does. */
export interface Scorer {
  score(payload: Record<string, SubmissionRow>): Promise<Scoreboard>;
}

const TIMEOUT_MS = 30_000;

/** `POST /submit` on the inbox server. */
export function inboxScorer(baseUrl: string): Scorer {
  const url = `${baseUrl.replace(/\/+$/, "")}/submit`;
  return {
    async score(payload) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        throw new RetryableError("the scorer is unreachable", { cause: error });
      }
      if (!response.ok) {
        // The scorer answered, and the answer was no. 503 is the scorer without
        // its ground truth mounted: not something a retry fixes from here, which
        // is why this is never marked retryable.
        const detail = (await response.text()).slice(0, 300);
        throw new UpstreamError(502, `the scorer answered ${response.status}: ${detail}`, { retryable: false });
      }
      const parsed = Scoreboard.safeParse(await response.json());
      if (!parsed.success) throw new TerminalError("the scorer's answer is not a scoreboard", { cause: parsed.error });
      return parsed.data;
    },
  };
}
