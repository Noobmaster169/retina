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
 * `RUN_PASSWORD` overrides the phrase. It has a default rather than being off
 * when unset, which is the opposite of the site gate and on purpose: a gate
 * that exists to stop an expensive accident must not be disabled by forgetting
 * to configure it.
 */

/** The shared phrase, used where `RUN_PASSWORD` names none. A word the team says out loud, not a secret. */
const DEFAULT_PHRASE = "clanker";

function phrase(): string {
  return process.env.RUN_PASSWORD || DEFAULT_PHRASE;
}

function sameString(a: string, b: string): boolean {
  // Hashed first so the comparison is constant-time whatever the lengths are.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function checkRunPassword(candidate: string | null | undefined): boolean {
  return typeof candidate === "string" && candidate.length > 0 && sameString(candidate, phrase());
}
