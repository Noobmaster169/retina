import { randomUUID } from "node:crypto";

import { closePool, closeRoPool, getPool } from "../src/db";
import { admit } from "../src/ingest";
import { MemoryGateMeter } from "../src/ingest/gate/__fakes__/memory.meter";
import type { EmailRecord } from "../src/ingest/source";
import { gateDecisions } from "../src/ontology/repositories";

/**
 * Drives a burst of synthetic mail past the gate and prints what it decided.
 *
 * It costs nothing. No model is called, no attachment is fetched, no run is
 * created and no email row is written: this is `admit` on its own, which is
 * the only part of ingest that decides anything. That is what makes it safe to
 * run before a demo and what makes it the exit checklist's burst drill.
 *
 * It exists because the alternative way to see the gate work is to replay 520
 * real emails through a pipeline that would classify all of them, and nobody
 * should have to spend that to find out whether a rate limiter counts.
 *
 *   pnpm gate:drill                  one stranger, twelve emails, enforcing
 *   pnpm gate:drill --emails 40      a longer burst
 *   pnpm gate:drill --mode observe   what it would have done, holding nothing
 *   pnpm gate:drill --docs 6         emails carrying six documents each
 *
 * The buckets live in this process, not in Redis, so two drills never fight
 * over one sender and neither leaves a bucket empty for a real run. The rows
 * it writes are the gate's own telemetry, which is what the /gate page draws.
 */

function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
}

const emails = Number(flag("emails", "12"));
const docs = Number(flag("docs", "2"));
const mode = flag("mode", "enforce") as "off" | "observe" | "enforce";
// A domain of its own per drill, so a second run of this script starts from an
// unknown sender again rather than from the one the first left behind.
const domain = flag("domain", `drill-${randomUUID().slice(0, 6)}.example`);

const pool = getPool();
const meter = new MemoryGateMeter();

function record(index: number): EmailRecord {
  const attachments = Array.from({ length: docs }, (_, n) => `drill/${index}_${n}.txt`);
  return {
    email_id: `drill_${randomUUID().slice(0, 8)}`,
    from: `docs@${domain}`,
    subject: "REQUEST BL DRAFT _ PO 26067_ COATED IVORY BOARD__138MT",
    body: "Please compare the shipping instruction against the draft bill of lading.",
    attachments,
    attachment_bytes: attachments.map(() => 4096),
  };
}

console.log(`${emails} emails from ${domain}, ${docs} documents each, mode ${mode}\n`);

let admitted = 0;
for (let index = 0; index < emails; index += 1) {
  const { verdict } = await admit({ pool, redis: null, meter, mode }, null, record(index));
  if (verdict.decision === "admit") admitted += 1;

  const bucket = verdict.buckets.find((one) => one.scope === verdict.scope);
  const where = bucket ? `${Math.floor(bucket.burstRemaining)} left of ${bucket.burstCapacity}, ${bucket.dailyUsed}/${bucket.dailyCap} today` : "";
  console.log(
    `${String(index + 1).padStart(3)}  ${verdict.decision.padEnd(5)} ${verdict.enforced ? "*" : " "}  ` +
      `${String(verdict.units).padStart(3)} units  ${verdict.standing.padEnd(12)} ${verdict.reason.padEnd(18)} ${where}`,
  );
}

const tally = await gateDecisions.tally(pool);
console.log(
  `\n${admitted} admitted, ${emails - admitted} held.` +
    ` A star means it actually stopped the email; in observe nothing does but a blacklist.` +
    `\nThe gate has recorded ${tally.decisionsToday} decisions today and ${tally.waiting} emails are waiting.`,
);

await closePool();
await closeRoPool();
