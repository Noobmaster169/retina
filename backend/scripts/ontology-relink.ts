// pnpm ontology:relink
//
// Fills the shipper, consignee and notify party of every shipment whose
// instruction settled a value the row never took. Until the business-data fix
// session the assembler only linked a party the shipment reader had repeated,
// and the reader is told not to repeat them, so most rows had none.
//
// Free: every settled spelling is already a mention some resolution pass
// clustered, so the lookup is a stored judgement and never a model call. A
// spelling no live thing holds is left for the next `ontology` job to judge.

import { closePool, getPool, withTx } from "../src/db";
import { emailShipments, entityInputs } from "../src/ontology/repositories";
import { EXTRACTED_ROLES, planSighting, SHIPMENT_COLUMNS, type ShipmentColumn } from "../src/pipeline/ontology";
import { settledFields } from "../src/queues/processors/ontology.processor";

const PARTY_ROLES = ["shipper", "consignee", "notify_party"] as const;

const pool = getPool();
const rows = await emailShipments.unlinkedParties(pool);
let filled = 0;
let unresolved = 0;
for (const row of rows) {
  const settled = await settledFields(pool, String(row.emailRunId));
  const links: Partial<Record<ShipmentColumn, number>> = {};
  for (const role of PARTY_ROLES) {
    const value = settled.find((field) => field.field === EXTRACTED_ROLES[role])?.value ?? null;
    if (value === null) continue;
    const plan = planSighting("party", value, await entityInputs.loadNameHits(pool, [value]));
    if (plan.decision === "use") links[SHIPMENT_COLUMNS[role]] = plan.entityId;
    else unresolved += 1;
  }
  if (Object.keys(links).length === 0) continue;
  await withTx(pool, (tx) => emailShipments.fillLinks(tx, row.emailId, links));
  filled += Object.keys(links).length;
}
console.log(`${rows.length} shipments walked, ${filled} party links filled, ${unresolved} settled values no live thing holds yet`);
await closePool();
