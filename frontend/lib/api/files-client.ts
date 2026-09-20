import { request } from "./transport";

/**
 * One object out of the backend's store: an original attachment, a page image
 * of a scan, or a document a reviewer supplied. The response is relayed
 * whole rather than read, so a large file never sits in this process's memory.
 *
 * The key is passed through as the backend wrote it. Nothing here composes
 * one: storage/keys.ts on the backend is the only place that does.
 */
export async function fetchFile(key: string): Promise<Response> {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return request(`/files/${path}`, { timeoutMs: 60_000 });
}
