import { ClientList, ClientRow, type ClientUpdate } from "./clients-schemas";
import { get, parseAs, refusalMessage, request } from "./transport";

export * from "./clients-schemas";

/**
 * The senders and their tier. Server-side only, like every client in this
 * folder: the shared secret must never reach the browser.
 *
 * A refusal comes back as a message rather than a throw, because the page
 * shows it. The api's own sentence is the one a person reads.
 */

export type ClientOutcome = { ok: true; client: ClientRow } | { ok: false; status: number; message: string };

export async function listClients(): Promise<ClientList> {
  return get(ClientList, "/clients");
}

export async function updateClient(domain: string, patch: ClientUpdate): Promise<ClientOutcome> {
  const path = `/clients/${encodeURIComponent(domain)}`;
  const response = await request(path, { method: "PUT", body: JSON.stringify(patch) });
  if (!response.ok) return { ok: false, status: response.status, message: await refusalMessage(response) };
  return { ok: true, client: await parseAs(ClientRow, response, `PUT ${path}`) };
}
