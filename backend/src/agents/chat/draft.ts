import type { EmailDraft } from "../../contracts";
import { shown } from "./grounding";

/**
 * Whether a drafted reply's address is one a tool actually returned on this
 * turn, and not a plausible one the model composed.
 *
 * The address is the one part of a draft nobody re-checks before it acts:
 * the rest is prose a person reads before sending, but a `mailto:` link opens
 * on `to` without a second look. So it is checked the way `next-moves.ts`
 * checks an alternative's number, against `grounds` and never against a
 * call's own text, which also echoes what was asked for.
 *
 * Pure.
 */
export function draftIsReal(draft: EmailDraft, grounds: string[]): boolean {
  return grounds.some((text) => shown(text, draft.to));
}
