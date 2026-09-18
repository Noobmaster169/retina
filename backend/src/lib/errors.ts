/** Worth another attempt: a timeout, a 5xx, a dependency that is restarting. */
export class RetryableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RetryableError";
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
