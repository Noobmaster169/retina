import type { ContextRef } from "@/lib/api/chat-agent-schemas";

/**
 * What the dock offers and what it sends. Pure.
 *
 * The page announces what it is about; a person may switch any of it off for a
 * question, or pin it so it stays when they leave the page. Everything offered
 * and not switched off goes with the question, pinned first, at most five: the
 * backend's cap.
 */

export interface OfferedRef extends ContextRef {
  title: string;
}

export const MAX_ATTACHED = 5;

export function keyOf(ref: ContextRef): string {
  return `${ref.kind}:${ref.id}`;
}

export function offered(page: OfferedRef[], pinned: OfferedRef[]): OfferedRef[] {
  const seen = new Set<string>();
  const out: OfferedRef[] = [];
  for (const ref of [...pinned, ...page]) {
    const key = keyOf(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/** What the harness shows. Run scope is the conversation default and is not drawn. */
export function displayed(page: OfferedRef[], pinned: OfferedRef[]): OfferedRef[] {
  return offered(page, pinned).filter((ref) => ref.kind !== "run");
}

export function attached(page: OfferedRef[], pinned: OfferedRef[], off: string[]): OfferedRef[] {
  return offered(page, pinned)
    .filter((ref) => !off.includes(keyOf(ref)))
    .slice(0, MAX_ATTACHED);
}
