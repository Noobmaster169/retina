import type { Queryable } from "../../db";
import type { DocExtractClient } from "../../doc-extract";
import { childLogger } from "../../lib/logger";
import { documents, type StoredAttachment, type StoredDocument } from "../../ontology/repositories";
import { keys, type ObjectStore } from "../../storage";
import type { EmailRunIds } from "./ids";

const log = childLogger({ module: "parse-documents" });

export interface ParseDeps {
  pool: Queryable;
  docExtract: DocExtractClient;
  store: ObjectStore;
}

/** A document row with its text in hand. Null text where the parser could not read the file. */
export interface ParsedDocument extends StoredDocument {
  text: string | null;
}

/**
 * Every attachment of the email parsed once. A row already there is read back
 * with its text from the store; the rest go through doc-extract, their text is
 * written to the store and a row is kept. Idempotent: classify may parse first
 * for a prompt that reads attachments, and compare then finds the rows.
 */
export async function parseDocuments(deps: ParseDeps, ids: EmailRunIds, files: StoredAttachment[]): Promise<ParsedDocument[]> {
  const known = new Map((await documents.listForEmailRun(deps.pool, ids.emailRunId)).map((doc) => [doc.attachmentId, doc]));
  const texts = new Map<string, string | null>();

  for (const file of files) {
    const existing = known.get(file.id);
    if (existing) {
      texts.set(file.id, existing.textObjectKey ? (await deps.store.get(existing.textObjectKey)).toString("utf8") : null);
      continue;
    }
    const extracted = await deps.docExtract.extract({ key: file.objectKey, filename: file.filename, contentType: file.contentType });
    const textObjectKey = extracted.unreadable ? null : keys.text(ids.runId, ids.emailId, file.filename);
    if (textObjectKey) await deps.store.put(textObjectKey, Buffer.from(extracted.text, "utf8"), "text/plain; charset=utf-8");
    await documents.upsert(deps.pool, {
      emailRunId: ids.emailRunId,
      attachmentId: file.id,
      role: file.role,
      format: extracted.format,
      textObjectKey,
      pages: extracted.pages.length,
      scanned: extracted.scanned,
      unreadable: extracted.unreadable,
      warnings: extracted.warnings,
      pageConfidence: extracted.pages.flatMap((page) => (page.ocr_confidence === null ? [] : [page.ocr_confidence])),
    });
    texts.set(file.id, extracted.unreadable ? null : extracted.text);
    log.info(
      { ...ids, stage: "parse", filename: file.filename, format: extracted.format, unreadable: extracted.unreadable, scanned: extracted.scanned },
      "parsed",
    );
  }

  const rows = await documents.listForEmailRun(deps.pool, ids.emailRunId);
  return rows.map((doc) => ({ ...doc, text: texts.get(doc.attachmentId) ?? null }));
}
