import { extname } from "node:path/posix";

/**
 * What each of an email's attachments is stored under, so that two of them can
 * never be one.
 *
 * An email's attachments are paths, and two different paths can end in the same
 * name: `2024/BL.pdf` and `2025/BL.pdf`, or the same document attached twice by a
 * forwarded chain. Their object keys and their row both key off the name, so the
 * second upload used to overwrite the first's bytes and then lose its own row to
 * `on conflict do nothing`. What survived was one row whose name said one document
 * and whose bytes were the other, which is the worst shape a bug can take here: an
 * instruction compared against a copy of itself reads OK.
 *
 * So a name is claimed once. A second claim on it is stored under the same stem
 * with a number before the extension, which keeps the extension deciding the
 * format and keeps the name readable.
 *
 * Pure. No io, and deterministic: the paths are sorted before they are handed out,
 * so the same attachments produce the same names whatever order the inbox listed
 * them in.
 */

/** What cannot be part of an object key: it would not survive the URL `/files/*key` serves it under. */
const UNSAFE = /[\u0000-\u001f\u007f]/g;

/** What a file with no usable name at all is stored under. */
const FALLBACK = "attachment";

/**
 * The name a path ends in, with anything that cannot live in a key taken out.
 *
 * Split on both separators, not `basename`: a forwarded Outlook attachment can
 * arrive as `C:\Users\...\BL.pdf`, and a posix `basename` hands that back whole.
 */
export function safeName(path: string): string {
  const name = (path.split(/[\\/]/).pop() ?? "").replace(UNSAFE, "").trim();
  if (name === "" || name === "." || name === "..") return FALLBACK;
  return name;
}

/** `BL.pdf` and 2 give `BL__2.pdf`: before the extension, so the format still reads off the end. */
function numbered(name: string, nth: number): string {
  const extension = extname(name);
  return `${name.slice(0, name.length - extension.length)}__${nth}${extension}`;
}

/**
 * Each path to the name it is stored under, every one distinct.
 *
 * A path repeated in the list is the same attachment named twice and maps to one
 * name; two different paths never share one.
 */
export function storedNames(paths: string[]): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();

  for (const path of [...new Set(paths)].sort()) {
    const wanted = safeName(path);
    let name = wanted;
    for (let nth = 2; taken.has(name); nth++) name = numbered(wanted, nth);
    taken.add(name);
    names.set(path, name);
  }
  return names;
}
