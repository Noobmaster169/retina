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

/**
 * A dependency answered and the answer was a failure: the proxy, the inbox, the
 * scorer. `status` is what the api relays to its own caller.
 *
 * `retryable` carries the dependency's own verdict. Status alone cannot separate
 * a permanent misconfiguration from an outage — the proxy answers 500 both for a
 * provider name that does not exist and for an upstream that fell over — and
 * guessing wrong in that direction retries a typo forever.
 */
export class UpstreamError extends Error {
  readonly status: number;
  /** Null where the dependency does not say, leaving `status` as the only signal. */
  readonly retryable: boolean | null;

  constructor(status: number, message: string, options?: { cause?: unknown; retryable?: boolean | null }) {
    super(message, { cause: options?.cause });
    this.name = "UpstreamError";
    this.status = status;
    this.retryable = options?.retryable ?? null;
  }
}

/**
 * Whether another attempt could plausibly succeed. The dependency's own verdict
 * wins; without one, 429 and 5xx are transient and everything else is a request
 * this side has to fix.
 */
export function isTransient(error: UpstreamError): boolean {
  return error.retryable ?? (error.status === 429 || error.status >= 500);
}

/**
 * What the api answers when a dependency failed. A 4xx is this request's fault
 * and says so; anything else is the dependency's and becomes a plain 502, so a
 * caller never sees an upstream's 500 as if the api itself had broken.
 */
export function relayStatus(status: number): number {
  return status >= 400 && status < 500 ? status : 502;
}
