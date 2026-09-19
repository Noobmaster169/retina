/** Worth another attempt: a timeout, a 5xx, a dependency that is restarting. */
export class RetryableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RetryableError";
  }
}

/**
 * The model could not be reached or is rate limited. Nothing is wrong with the
 * email, so the worker pauses the queue and puts the job back without spending
 * one of its attempts: an outage must not fail a run's emails for good.
 */
export class LlmUnavailableError extends RetryableError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LlmUnavailableError";
  }
}

/** Will fail the same way every time: bad input, a 404, a schema that does not parse. */
export class TerminalError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TerminalError";
  }
}

/** Unknown errors are retried: a wasted attempt costs less than a dropped email. */
export function isRetryable(error: unknown): boolean {
  return !(error instanceof TerminalError);
}
