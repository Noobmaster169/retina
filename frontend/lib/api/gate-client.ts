import {
  GateHeldList,
  GateOverview,
  type GatePolicyUpdate,
  GateReleaseResult,
  GateSenderList,
  GateSenderRow,
} from "./gate-schemas";
import { get, parseAs, refusalMessage, request } from "./transport";

export * from "./gate-schemas";

/**
 * What the gate is doing, and the two decisions a person may make about it.
 * Server-side only, like every client in this folder: the shared secret must
 * never reach the browser.
 *
 * A refusal comes back as a message rather than a throw, because the page
 * shows it. The api's own sentence is the one a person reads.
 */

export type GateWriteOutcome<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

export async function getGate(): Promise<GateOverview> {
  return get(GateOverview, "/gate");
}

export async function listGateSenders(): Promise<GateSenderList> {
  return get(GateSenderList, "/gate/senders");
}

export async function listHeld(): Promise<GateHeldList> {
  return get(GateHeldList, "/gate/held");
}

export async function setGatePolicy(principal: string, patch: GatePolicyUpdate): Promise<GateWriteOutcome<GateSenderRow>> {
  const path = `/gate/senders/${encodeURIComponent(principal)}`;
  const response = await request(path, { method: "PUT", body: JSON.stringify(patch) });
  if (!response.ok) return { ok: false, status: response.status, message: await refusalMessage(response) };
  return { ok: true, value: await parseAs(GateSenderRow, response, `PUT ${path}`) };
}

export async function releaseHeld(id: string): Promise<GateWriteOutcome<GateReleaseResult>> {
  const path = `/gate/held/${encodeURIComponent(id)}/release`;
  const response = await request(path, { method: "POST", body: "{}" });
  if (!response.ok) return { ok: false, status: response.status, message: await refusalMessage(response) };
  return { ok: true, value: await parseAs(GateReleaseResult, response, `POST ${path}`) };
}
