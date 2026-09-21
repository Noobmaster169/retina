/**
 * Reaching an object in the backend's store from the browser.
 *
 * Nothing here composes a key. `backend/src/storage/keys.ts` is the only place
 * that does, and a key reaches a page on a view contract: this turns one into
 * the address of the route that streams it, and nothing more.
 */

/** Where `/api/files` serves this key. Each segment is encoded; the slashes between them are the path. */
export function fileHref(key: string): string {
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * A stored document can be long, and this is a reading of one rather than the
 * document itself: past this it is cut, and the original is a click away.
 */
export const TEXT_LIMIT = 100_000;

export async function textFetcher(href: string): Promise<string> {
  const response = await fetch(href);
  if (!response.ok) {
    throw new Error(response.status === 404 ? "That file is no longer in the store." : `Could not read it (${response.status}).`);
  }
  const body = await response.text();
  if (body.length <= TEXT_LIMIT) return body;
  return `${body.slice(0, TEXT_LIMIT)}\n\n[cut at ${TEXT_LIMIT.toLocaleString()} characters]`;
}

/** Which formats a browser draws on its own. Everything else is read through the parser, or downloaded. */
export function browserCanDraw(format: string): boolean {
  return format === "pdf" || format === "txt";
}
