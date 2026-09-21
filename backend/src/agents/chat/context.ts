import type { ContextRef } from "../../contracts";
import type { Queryable } from "../../db";
import { childLogger } from "../../lib/logger";
import { emails, entities, entityProfile, runs, shipmentRead } from "../../ontology/repositories";
import { summaryOf } from "../../ontology/repositories/entities.repo";

const log = childLogger({ module: "chat.context" });

/**
 * What the person was looking at, as one line each for the scope section.
 *
 * A ref is resolved through the same repositories the pages read, so what the
 * model is told is what the person can see. A ref nothing holds is dropped and
 * logged rather than failing the turn: a page can be a step ahead of the data.
 */

export interface ResolvedContext {
  ref: ContextRef;
  title: string;
  line: string;
}

function roleLine(roles: Record<string, number>): string {
  const parts = Object.entries(roles)
    .sort((a, b) => b[1] - a[1])
    .map(([role, n]) => `${role.replace(/_/g, " ")} on ${n} email${n === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "seen on no email yet";
}

function attributeLine(attributes: Record<string, string | null>): string {
  const parts = Object.entries(attributes)
    .filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== "")
    .map(([key, value]) => `${key} ${value}`);
  return parts.length ? ` ${parts.join(", ")}.` : "";
}

async function one(db: Queryable, ref: ContextRef): Promise<ResolvedContext | null> {
  if (ref.kind === "run") {
    const run = await runs.get(db, ref.id);
    if (!run) return null;
    return {
      ref,
      title: `run ${run.id.slice(0, 8)}`,
      line: `Run ${run.id}: ${run.status}, ${run.totalEmails ?? "an unknown number of"} emails.`,
    };
  }
  if (ref.kind === "email") {
    const email = await emails.get(db, ref.id);
    if (!email) return null;
    return { ref, title: ref.id, line: `Email ${ref.id} from ${email.senderDomain}: "${email.subject}".` };
  }
  if (ref.kind === "shipment") {
    const shipment = await shipmentRead.detail(db, ref.id);
    if (!shipment) return null;
    const lane = [shipment.pol?.name, shipment.pod?.name].filter(Boolean).join(" to ");
    return {
      ref,
      title: `shipment ${shipment.ocNo ?? shipment.blNo ?? ref.id}`,
      line: `Shipment on email ${ref.id}: OC ${shipment.ocNo ?? "unknown"}, BL ${shipment.blNo ?? "unknown"}, ${shipment.shipper?.name ?? "unknown shipper"} to ${shipment.consignee?.name ?? "unknown consignee"}${lane ? `, ${lane}` : ""}.`,
    };
  }
  const row = await entities.find(db, ref.id);
  if (!row || row.type !== ref.kind) return null;
  const profile = await entityProfile.read(db, ref.id);
  const summary = summaryOf(profile?.markdown ?? null);
  const line = `${row.name} (a ${ref.kind}, id ${row.id}):${summary ? ` ${summary}` : ""}${attributeLine(row.attributes)} ${roleLine(row.roles)}.`;
  return { ref, title: row.name, line };
}

export async function resolveContext(db: Queryable, refs: ContextRef[]): Promise<ResolvedContext[]> {
  const resolved: ResolvedContext[] = [];
  for (const ref of refs) {
    const item = await one(db, ref);
    if (item) resolved.push(item);
    else log.warn({ ref }, "a context ref named nothing; dropped");
  }
  return resolved;
}
