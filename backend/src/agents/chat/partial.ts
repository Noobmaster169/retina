/**
 * Reading one field out of a JSON object that is still being written.
 *
 * With a schema, what the proxy streams back is not prose: it is the model
 * writing its answer object, a piece at a time. The page wants the value of
 * one key out of that, while it grows, so the answer can appear a word at a
 * time instead of all at once when the call ends.
 *
 * Nothing here validates. The finished, validated object still arrives on the
 * final delta and is what gets stored; this is only ever a preview, and a
 * preview that is briefly wrong costs a repaint.
 */

interface ScannedString {
  value: string;
  /** Index just past the closing quote, or where scanning stopped. */
  end: number;
  closed: boolean;
}

const SIMPLE_ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

const HEX = /^[0-9a-fA-F]{4}$/;

/**
 * The JSON string starting at `start`, decoded as far as it goes.
 *
 * An escape cut in half by the end of the text is dropped rather than shown:
 * a lone backslash or three digits of a `\u` would otherwise flicker into the
 * answer and out again on the next piece.
 */
function scanString(text: string, start: number): ScannedString {
  let value = "";
  let i = start + 1;
  while (i < text.length) {
    const char = text[i];
    if (char === '"') return { value, end: i + 1, closed: true };
    if (char !== "\\") {
      value += char;
      i += 1;
      continue;
    }
    const next = text[i + 1];
    if (next === undefined) return { value, end: i, closed: false };
    if (next === "u") {
      const hex = text.slice(i + 2, i + 6);
      if (!HEX.test(hex)) return { value, end: i, closed: false };
      value += String.fromCharCode(parseInt(hex, 16));
      i += 6;
      continue;
    }
    // An escape the spec does not define is passed through as the character
    // itself. A preview is not the place to refuse a document.
    value += SIMPLE_ESCAPES[next] ?? next;
    i += 2;
  }
  return { value, end: i, closed: false };
}

/**
 * What has been written of `key`'s string value, or an empty string.
 *
 * Keys are found by walking the document rather than by searching for the
 * name, so a key spelled inside some other field's text is not mistaken for
 * the field itself. That happens: the chat's own `reading` field can quote the
 * question, and a question can contain anything.
 */
export function valueSoFar(text: string, key: string): string {
  let pendingKey: string | null = null;
  let i = 0;

  while (i < text.length) {
    if (text[i] !== '"') {
      i += 1;
      continue;
    }
    const scanned = scanString(text, i);
    // An unterminated string is the one being written right now. If it belongs
    // to the key being watched, it is the answer so far; otherwise the key has
    // not been reached and there is nothing to show.
    if (!scanned.closed) return pendingKey === key ? scanned.value : "";

    let after = scanned.end;
    while (after < text.length && /\s/.test(text[after])) after += 1;
    if (text[after] === ":") {
      pendingKey = scanned.value;
      i = after + 1;
      continue;
    }

    if (pendingKey === key) return scanned.value;
    pendingKey = null;
    i = scanned.end;
  }

  return "";
}
