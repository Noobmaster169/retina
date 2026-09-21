/**
 * A country's flag from its ISO 3166 code, built from the two regional
 * indicator letters at render time. The code is data; nothing here is a
 * literal emoji. Null for anything that is not two letters, so a card falls
 * back to its kind's glyph rather than drawing a broken pair.
 */
export function flagOf(code: string | null | undefined): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  const [a, b] = code.toUpperCase();
  return String.fromCodePoint(0x1f1e6 + a.charCodeAt(0) - 65, 0x1f1e6 + b.charCodeAt(0) - 65);
}
