import { FLAG_CODES } from "./flag-codes";

/**
 * Where a country's flag is, from its ISO 3166 code. An SVG served by the
 * app rather than an emoji, because Windows draws no flag emoji at all and
 * would show the two letters instead. Null for a code with no flag, so a
 * card falls back to its kind's glyph.
 */
export function flagSrc(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return FLAG_CODES.has(upper) ? `/flags/${upper}.svg` : null;
}
