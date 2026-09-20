// pnpm ontology:backfill [--limit N]
//
// Enqueues one semantic reading per finished email that has no shipment row
// yet. It spends tokens, roughly two model calls per email plus one per
// spelling nothing already holds, so development runs stay at 20 to 30 and the
// full backfill is the user's to start.

import { parseArgs } from "node:util";

import { closePool, closeRoPool, getPool } from "../src/db";
import { emailShipments } from "../src/ontology/repositories";
import { closeRedis } from "../src/queues/connection";
import { JOB_NAMES, ontologyJobOptions } from "../src/queues/names";
import { closeQueues, getQueues } from "../src/queues/queues";

const { values } = parseArgs({ options: { limit: { type: "string" } } });
const limit = Number(values.limit ?? 30);

const pool = getPool();
const pending = await emailShipments.withoutShipment(pool, limit);

if (pending.length === 0) console.log("every finished email already has a shipment row");
else {
  const queue = getQueues().ontology;
  for (const email of pending) {
    // The job id is the email id, so a second enqueue while one waits is the
    // same work and BullMQ refusing it is the behaviour wanted.
    await queue.add(JOB_NAMES.ontology, email, ontologyJobOptions(email.emailId));
  }
  console.log(`queued ${pending.length} ${pending.length === 1 ? "email" : "emails"}: ${pending[0].emailId} to ${pending[pending.length - 1].emailId}`);
}

await closeQueues();
await closeRedis();
await closePool();
await closeRoPool();
