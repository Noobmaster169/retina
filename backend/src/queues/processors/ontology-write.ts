import type { Queryable } from "../../db";
import { emailShipments, entities, entityResolution, type NewSighting, sightings } from "../../ontology/repositories";
import type { AssembledShipment, ShipmentColumn } from "../../pipeline/ontology";
import type { OntologyJob } from "../names";
import type { ResolvedOntology } from "./ontology-resolve";

/**
 * One email's things, its sightings and its shipment, written together.
 *
 * Both tables are replaced in full for that email and left alone for every
 * other, which is the rule the pipeline already follows for a stage. The
 * things it touched are marked stale in the same statement run, so the profile
 * job picks them up on its next tick whatever happens afterwards.
 *
 * The caller wraps this in one transaction. A half-written reading, with three
 * of five things created and no shipment, is the shape a retry cannot tell
 * from a finished one.
 */
export async function writeOntology(tx: Queryable, job: OntologyJob, assembled: AssembledShipment, resolved: ResolvedOntology): Promise<number[]> {
  const ids = new Map<string, number>();
  for (const [key, decision] of resolved.decisions) {
    if (decision.action === "use") {
      ids.set(key, decision.entityId);
      continue;
    }
    if (decision.action === "create") {
      ids.set(key, await entityResolution.insertFromSighting(tx, decision.kind, decision.surface, new Date()));
      continue;
    }
    await entityResolution.addJudgedName(tx, decision.entityId, decision.surface, decision.confidence, decision.step);
    ids.set(key, decision.entityId);
  }

  const rows: NewSighting[] = resolved.sightings.flatMap((sighting) => {
    const entityId = ids.get(sighting.thing);
    return entityId === undefined ? [] : [{ ...sighting, entityId }];
  });
  await sightings.replaceForEmail(tx, job.emailId, job.emailRunId, rows);

  const links: Partial<Record<ShipmentColumn, number>> = {};
  for (const [column, key] of Object.entries(resolved.links)) {
    const entityId = ids.get(key);
    if (entityId !== undefined) links[column as ShipmentColumn] = entityId;
  }
  await emailShipments.replaceForEmail(tx, {
    emailId: job.emailId,
    emailRunId: job.emailRunId,
    draft: assembled.shipment,
    links,
  });

  const touched = [...new Set(ids.values())];
  await entities.markStale(tx, touched);
  return touched;
}
