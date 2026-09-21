import type { SliceTone } from "./outcomes";

/**
 * The one place an outcome's hue is named, because the pie, the bars and the
 * legend all have to agree about it or the panel reads as three panels.
 *
 * `bar` is a CSS variable rather than a class because an SVG stroke and an
 * inline width both take a colour and not a utility.
 */
export const SLICE_TONE: Record<SliceTone, { key: string; bar: string }> = {
  match: { key: "text-match", bar: "var(--verdict-match)" },
  differ: { key: "text-differ", bar: "var(--verdict-differ)" },
  review: { key: "text-review", bar: "var(--verdict-review)" },
  fault: { key: "text-fault", bar: "var(--verdict-fault)" },
  muted: { key: "text-ink-tertiary", bar: "var(--ink-faint)" },
};
