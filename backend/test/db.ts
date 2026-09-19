import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { getPool } from "../src/db";
import { emails, runs } from "../src/ontology/repositories";

/** Runs `fn` inside a transaction that is always rolled back, so tests leave no rows. */
export async function inRollback<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

/** Ids no other test or earlier test run can collide with. */
export function uniqueEmailId(): string {
  return `email_t_${randomUUID().slice(0, 8)}`;
}

export async function seedRun(db: PoolClient, overrides: Partial<runs.NewRun> = {}): Promise<runs.Run> {
  return runs.create(db, { id: randomUUID(), source: "averis", ratePerSecond: 0, ...overrides });
}

export async function seedEmail(db: PoolClient, emailId = uniqueEmailId()): Promise<string> {
  await emails.upsert(db, {
    emailId,
    from: "docs@vitalsolutions.sg",
    senderDomain: "vitalsolutions.sg",
    subject: "REQUEST BL DRAFT _ PO 26067_ COATED IVORY BOARD__138MT",
    body: "Hi Mitchelle, please compare the SI and draft BL.",
    attachmentPaths: [`attachments/${emailId}_SI.txt`, `attachments/${emailId}_BL.txt`],
    tonnageMt: 138,
    raw: { email_id: emailId },
  });
  return emailId;
}
