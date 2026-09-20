import { createHash } from "node:crypto";
import { basename } from "node:path/posix";

import type { Pool } from "pg";

import { withTx } from "../db";
import { attachments, emailRuns, emails } from "../ontology/repositories";
import { type ClassifyJob, JOB_NAMES, type JobAdder, jobOptions } from "../queues/names";
import { computePriority } from "../queues/priority";
import type { PriorityCache } from "../queues/priority-cache";
import { keys, type ObjectStore } from "../storage";
import { parseTonnage, roleFromName, senderDomain } from "./email-facts";
import type { Source } from "./source";

export interface IngestDeps {
  pool: Pool;
  source: Source;
  store: ObjectStore;
  classify: JobAdder<ClassifyJob>;
  /** Where the sender's tier is read at enqueue. A miss is the default tier, never a failure to queue. */
  priority: PriorityCache;
}

/**
 * What this email is worth to the queue: its client's tier, broken by the
 * tonnage in its subject. Read from the row rather than recomputed, so a
 * rerun and a first run of the same email agree, and so a tier changed after
 * ingest does not silently reorder work already in flight.
 */
async function priorityFor(deps: IngestDeps, runId: string, emailId: string): Promise<number> {
  const stored = await emailRuns.priorityOf(deps.pool, runId, emailId);
  if (stored !== null) return stored;
  const email = await emails.get(deps.pool, emailId);
  if (!email) return computePriority({ tier: null, tonnageMt: null });
  return computePriority({ tier: await deps.priority.tierOf(email.senderDomain), tonnageMt: email.tonnageMt });
}

export async function enqueueClassify(deps: IngestDeps, runId: string, emailId: string): Promise<void> {
  const priority = await priorityFor(deps, runId, emailId);
  await deps.classify.add(JOB_NAMES.classify, { runId, emailId }, jobOptions(runId, emailId, priority));
}

/** Copies the email's attachments into object storage and returns the rows that describe them. */
async function storeAttachments(
  deps: IngestDeps,
  runId: string,
  emailId: string,
  paths: string[],
): Promise<attachments.NewAttachment[]> {
  // One attachment's download and upload has nothing to do with the next one's,
  // and Promise.all keeps the rows in the order the paths came in.
  return Promise.all(
    paths.map(async (path) => {
      const { bytes, contentType } = await deps.source.readAttachment(path);
      const filename = basename(path);
      const objectKey = keys.attachment(runId, emailId, filename);
      await deps.store.put(objectKey, bytes, contentType);
      return {
        runId,
        emailId,
        filename,
        sourcePath: path,
        role: roleFromName(filename),
        objectKey,
        contentType,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }),
  );
}

/** Downloads, uploads, then writes the rows in one short transaction. */
async function copyIn(deps: IngestDeps, runId: string, emailId: string): Promise<void> {
  const record = await deps.source.getEmail(emailId);
  // Before the transaction opens, so a slow inbox or object store never holds
  // a pooled connection or a row lock.
  const stored = await storeAttachments(deps, runId, emailId, record.attachments);
  // Also before it: with Redis reconnecting, a cache read waits for the
  // reconnect, and inside the transaction that would hold a pooled connection
  // and a row lock for as long as the outage lasts.
  const priority = computePriority({
    tier: await deps.priority.tierOf(senderDomain(record.from)),
    tonnageMt: parseTonnage(record.subject),
  });

  await withTx(deps.pool, async (tx) => {
    // The upsert locks the email row, so two callers on one email take turns and the second finds the row below.
    await emails.upsert(tx, {
      emailId: record.email_id,
      from: record.from,
      senderDomain: senderDomain(record.from),
      subject: record.subject,
      body: record.body,
      attachmentPaths: record.attachments,
      tonnageMt: parseTonnage(record.subject),
      raw: record,
    });
    if (await emailRuns.exists(tx, runId, emailId)) return;
    for (const attachment of stored) await attachments.insert(tx, attachment);
    await emailRuns.insert(tx, { runId, emailId, stage: "ingested", priority });
  });
}

/**
 * Brings one email into a run: its attachments in object storage, the rows,
 * then the classify job. Safe to call again for the same (run, email): rows
 * are written once, an object is overwritten with the same bytes, and the job
 * id makes the second enqueue a no-op.
 */
export async function ingestEmail(deps: IngestDeps, runId: string, emailId: string): Promise<void> {
  if (!(await emailRuns.exists(deps.pool, runId, emailId))) await copyIn(deps, runId, emailId);

  // After the commit, never before: a job must not reference a row that is not there.
  await enqueueClassify(deps, runId, emailId);
}
