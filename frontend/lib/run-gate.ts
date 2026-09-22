import { createHash, timingSafeEqual } from "node:crypto";

export { RUN_PASSWORD_HEADER } from "./run-gate.header";

/**
 * The password that starts a run.
 *
 * Not the site gate, and deliberately not a second copy of it. That one asks
 * once and remembers for thirty days, because it is about who may see the
 * screens. This one asks every time, because it is about the one action on
 * those screens that spends real money: a run of the whole inbox is thousands
 * of model calls, and the difference between meaning it and brushing the
 * keyboard is a sentence in a confirm box. So there is no cookie and no
 * session here. Typing it is the whole of it, every time.
 *
 * Server-side only, like `site-gate.ts`: it reads the answer and the browser
 * never holds it.
 *
 * The phrase itself is `RUN_PASSWORD` and lives nowhere in this repository.
 * It had a default once, on the argument that a guard against an expensive
 * accident should not be disabled by forgetting to configure it. That argument
 * was right and the answer was wrong: a default in the source is the password
 * published to everyone who can read the source, which is a worse failure than
 * the one it prevented.
 *
 * So the gate fails closed instead. Unset, nothing starts a run at all and the
 * route says why. That keeps what the default was for, which is that this
 * cannot be quietly switched off, and keeps the phrase out of git.
 */

function phrase(): string | undefined {
  return process.env.RUN_PASSWORD || undefined;
}

/** Whether a password has been configured. False means no run can start, which the route explains rather than blaming the typist. */
export function runGateConfigured(): boolean {
  return phrase() !== undefined;
}

function sameString(a: string, b: string): boolean {
  // Hashed first so the comparison is constant-time whatever the lengths are.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function checkRunPassword(candidate: string | null | undefined): boolean {
  const expected = phrase();
  if (expected === undefined) return false;
  return typeof candidate === "string" && candidate.length > 0 && sameString(candidate, expected);
}
