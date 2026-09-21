import type { BusinessKind } from "@/components/business/kind";
import { KINDS } from "@/components/business/kind";

/**
 * The link an answer writes around a name it resolved.
 *
 * The backend rewrites each link the agent wrote to `entity:<kind>/<id>` once
 * it has checked the id against what a tool on that turn actually returned,
 * and strips the markup from one it could not. So a href in this shape is a
 * link that was verified, and anything else is not a mention: while the answer
 * is still streaming it is the half-written `entity:412`, which reads as the
 * words it wraps until the turn lands and the kind arrives.
 */

export interface Mention {
  kind: BusinessKind;
  id: string;
  /** Where clicking goes, or null for a kind that has no page of its own yet. */
  href: string | null;
}

const REF = /^entity:([a-z]+)\/(\d+)$/;

export function mentionIn(href: string | undefined): Mention | null {
  const match = REF.exec(href ?? "");
  if (!match) return null;
  const [, kind, id] = match;
  if (!(kind in KINDS)) return null;
  const entry = KINDS[kind as BusinessKind];
  return { kind: kind as BusinessKind, id, href: entry.route ? `${entry.route}/${id}` : null };
}

/** True for any `entity:` href, verified or not: the renderer draws the rest as plain words. */
export function isMentionHref(href: string | undefined): boolean {
  return (href ?? "").startsWith("entity:");
}

/**
 * The same text with a link that is still being written cut off the end.
 *
 * For the streaming preview only. A mention arrives as `[Evergreen Mar`, then
 * `[Evergreen Marine Corp](entity:`, before it is anything a renderer can
 * draw, and those two seconds of brackets and scheme in the middle of a
 * sentence are the one piece of markup a reader would notice. Dropping the
 * fragment costs the last few words for as long as it takes to close, which is
 * what the answer already does with every other half-written token.
 */
export function withoutUnfinishedLink(text: string): string {
  const opened = text.lastIndexOf("[");
  if (opened === -1) return text;
  const rest = text.slice(opened);
  if (rest.includes(")") || /[\r\n]/.test(rest)) return text;
  return text.slice(0, opened);
}
