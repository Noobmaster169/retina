import { type LlmClient, promptFor, readByLooking } from "../../agents";
import type { PromptSet } from "../../contracts";
import type { Queryable } from "../../db";
import type { DocExtractClient, UnreadImage } from "../../doc-extract";
import { childLogger } from "../../lib/logger";
import type { LiveCalls } from "../../live";
import { documents, type StoredAttachment, type StoredDocument } from "../../ontology/repositories";
import { keys, type ObjectStore } from "../../storage";
import type { EmailRunIds } from "./ids";

const log = childLogger({ module: "parse-documents" });

/** What the model may be asked to look at in one document. A real one is a page or two. */
const MAX_IMAGES = 12;

export interface ParseDeps {
  pool: Queryable;
  docExtract: DocExtractClient;
  store: ObjectStore;
  llm: LlmClient;
  live?: LiveCalls;
}

/** A document row with its text in hand. Null text where nothing could read the file. */
export interface ParsedDocument extends StoredDocument {
  text: string | null;
}

/** What a picture's bytes are, for the wire. The service writes every one of them as a PNG. */
async function asImages(store: ObjectStore, images: UnreadImage[]): Promise<{ mediaType: string; base64: string }[]> {
  const wanted = images.slice(0, MAX_IMAGES);
  return Promise.all(
    wanted.map(async (image) => ({ mediaType: "image/png", base64: (await store.get(image.key)).toString("base64") })),
  );
}

/**
 * A document whose content is pixels, read by looking at it.
 *
 * Returns the transcription, or null when the model says the page cannot be worked
 * from, which is the one honest `unreadable`: what a model cannot make out of a
 * picture, a person opening the same file cannot either.
 */
async function lookAt(
  deps: ParseDeps,
  set: PromptSet,
  ids: EmailRunIds,
  filename: string,
  images: UnreadImage[],
): Promise<string | null> {
  const prompt = promptFor("vision-read", set);
  const { value } = await readByLooking(
    deps,
    prompt,
    { filename, images: await asImages(deps.store, images) },
    { runId: ids.runId, emailRunId: ids.emailRunId },
  );
  log.info(
    { ...ids, stage: "parse", filename, images: images.length, legible: value.legible, note: value.note },
    value.legible ? "read a document by looking at it" : "a document could not be made out, by a model or by a person",
  );
  return value.legible && value.text.trim().length > 0 ? value.text : null;
}

/**
 * Every attachment of the email parsed once. A row already there is read back
 * with its text from the store; the rest go through doc-extract, and whatever it
 * could not turn into text is looked at instead. The text either way is written to
 * the store and a row is kept, so everything downstream reads one kind of thing.
 *
 * Idempotent: classify may parse first for a prompt that reads attachments, and
 * compare then finds the rows rather than paying for any of it again.
 */
export async function parseDocuments(
  deps: ParseDeps,
  set: PromptSet,
  ids: EmailRunIds,
  files: StoredAttachment[],
): Promise<ParsedDocument[]> {
  const known = new Map((await documents.listForEmailRun(deps.pool, ids.emailRunId)).map((doc) => [doc.attachmentId, doc]));
  const texts = new Map<string, string | null>();

  for (const file of files) {
    const existing = known.get(file.id);
    if (existing) {
      texts.set(file.id, existing.textObjectKey ? (await deps.store.get(existing.textObjectKey)).toString("utf8") : null);
      continue;
    }
    const extracted = await deps.docExtract.extract({
      key: file.objectKey,
      filename: file.filename,
      contentType: file.contentType,
      outPrefix: keys.images(ids.runId, ids.emailId, file.filename),
    });

    // The text it read, plus whatever it could only hand over as pixels. A page with
    // a text layer and a picture beside it contributes both.
    const seen = extracted.images.length > 0 ? await lookAt(deps, set, ids, file.filename, extracted.images) : null;
    const parts = [extracted.text.trim(), seen?.trim() ?? ""].filter((part) => part.length > 0);
    const text = parts.length > 0 ? parts.join("\n\n") : null;
    const unreadable = text === null;

    const textObjectKey = unreadable ? null : keys.text(ids.runId, ids.emailId, file.filename);
    if (textObjectKey && text) await deps.store.put(textObjectKey, Buffer.from(text, "utf8"), "text/plain; charset=utf-8");
    await documents.upsert(deps.pool, {
      emailRunId: ids.emailRunId,
      attachmentId: file.id,
      role: file.role,
      format: extracted.format,
      textObjectKey,
      pages: extracted.pages.length,
      scanned: extracted.has_images,
      unreadable,
      warnings: extracted.warnings,
      pageConfidence: [],
    });
    texts.set(file.id, text);
    log.info(
      { ...ids, stage: "parse", filename: file.filename, format: extracted.format, unreadable, images: extracted.images.length },
      "parsed",
    );
  }

  const rows = await documents.listForEmailRun(deps.pool, ids.emailRunId);
  return rows.map((doc) => ({ ...doc, text: texts.get(doc.attachmentId) ?? null }));
}
