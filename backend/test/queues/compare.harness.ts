import type { PoolClient } from "pg";

import { attachments, emailRuns } from "../../src/ontology/repositories";
import { keys } from "../../src/storage";
import { seedEmail, seedRun } from "../db";

/** A classified email of a fresh run with these attachments, ready for the compare stage. */
export async function classified(tx: PoolClient, files: { filename: string; role: "SI" | "BL" | "UNKNOWN" }[]) {
  const run = await seedRun(tx);
  const emailId = await seedEmail(tx);
  await emailRuns.insert(tx, { runId: run.id, emailId, stage: "classified", priority: 600 });
  for (const file of files) {
    await attachments.insert(tx, {
      runId: run.id,
      emailId,
      filename: file.filename,
      sourcePath: `attachments/${file.filename}`,
      role: file.role,
      objectKey: keys.attachment(run.id, emailId, file.filename),
      contentType: file.filename.endsWith(".pdf") ? "application/pdf" : "text/plain",
      bytes: 600,
      sha256: "0".repeat(64),
    });
  }
  const emailRunId = (await emailRuns.idOf(tx, run.id, emailId)) as string;
  const key = (filename: string) => keys.attachment(run.id, emailId, filename);
  return { runId: run.id, emailId, emailRunId, key };
}

/** An SI and a BL as plain text files, as most of the inbox's pairs are. */
export const pair = (tx: PoolClient) =>
  classified(tx, [
    { filename: "e_SI.txt", role: "SI" },
    { filename: "e_BL.txt", role: "BL" },
  ]);

/** Where the email ended and what the comparison row says. */
export async function outcome(tx: PoolClient, emailRunId: string) {
  const { rows } = await tx.query(
    `select er.stage, er.outcome, er.finished_at, c.status, c.review_reason, c.detail
       from core.email_runs er left join core.comparisons c on c.email_run_id = er.id where er.id = $1`,
    [emailRunId],
  );
  return rows[0];
}

export const triage = (request: string) => JSON.stringify({ rationale: "The sender asks for it.", request, confidence: 0.9 });

export const INVOICE_TEXT = "COMMERCIAL INVOICE\n\nInvoice No.: 1\nTotal Amount: USD 22,500.00\n";
