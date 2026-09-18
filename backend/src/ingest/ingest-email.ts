import { createHash } from "node:crypto";
import { basename } from "node:path/posix";

import type { Pool } from "pg";

import { withTx } from "../db";
import { attachments, emailRuns, emails } from "../ontology/repositories";
import { type ClassifyJob, DEFAULT_PRIORITY, JOB_NAMES, type JobAdder, jobOptions } from "../queues/names";
import { keys, type ObjectStore } from "../storage";
import { parseTonnage, roleFromName, senderDomain } from "./email-facts";
import type { Source } from "./source";

export interface IngestDeps {
  pool: Pool;
  source: Source;
  store: ObjectStore;
  classify: JobAdder<ClassifyJob>;
}

export async function enqueueClassify(deps: IngestDeps, runId: string, emailId: string): Promise<void> {
  await deps.classify.add(JOB_NAMES.classify, { runId, emailId }, jobOptions(runId, emailId, DEFAULT_PRIORITY));
}

/**
 * Brings one email into a run: the row, its attachments in object storage,
 * then the classify job. Safe to call again for the same (run, email): rows
 * are written once and the job id makes the second enqueue a no-op.
 */
export async function ingestEmail(deps: IngestDeps, runId: string, emailId: string): Promise<void> {
  const record = await deps.source.getEmail(emailId);

  await withTx(deps.pool, async (tx) => {
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

    for (const path of record.attachments) {
      const { bytes, contentType } = await deps.source.readAttachment(path);
      const filename = basename(path);
      const objectKey = keys.attachment(runId, emailId, filename);
      await deps.store.put(objectKey, bytes, contentType);
      await attachments.insert(tx, {
        runId,
        emailId,
        filename,
        sourcePath: path,
        role: roleFromName(filename),
        objectKey,
        contentType,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
    await emailRuns.insert(tx, { runId, emailId, stage: "ingested", priority: DEFAULT_PRIORITY });
  });

  // After the commit, never before: a job must not reference a row that is not there.
  await enqueueClassify(deps, runId, emailId);
}
