import { z } from "zod";

/**
 * One attachment of one email run, as the parser saw it and as the model typed
 * it. Mirrors the document half of backend/src/contracts.review.ts; change
 * both or neither.
 *
 * Its own file because `trace-schemas.ts` is the email's whole story and this
 * is one paragraph of it, read on its own by the sheet that draws a document.
 */

/**
 * How a document's reading stands against the place its file name claims.
 * Decided by the compare stage, never by a page. Mirrors contracts.review.ts.
 */
export const TypeVerdict = z.enum(["unknown", "ok", "crossed", "wrong_type"]);
export type TypeVerdict = z.infer<typeof TypeVerdict>;

/** Ours, not an organiser enum: what the model says a document is. */
export const DocType = z.enum(["SI", "BL", "INVOICE", "PACKING_LIST", "COO", "OTHER"]);
export type DocType = z.infer<typeof DocType>;

/** One attachment of one email run, as the parser saw it and as the model typed it. Mirrors contracts.review.ts. */
export const DocumentView = z.object({
  filename: z.string(),
  /** What the filename claims. */
  role: z.enum(["SI", "BL", "UNKNOWN"]),
  /** What the model says, or null before it has read the text or when there was none. */
  docType: DocType.nullable(),
  docTypeConfidence: z.number().nullable(),
  docTypeRationale: z.string().nullable(),
  /** What the compare stage makes of that reading. Shown as given; never recomputed here. */
  typeVerdict: TypeVerdict,
  format: z.enum(["txt", "pdf", "docx", "xlsx", "image", "unknown"]),
  pages: z.number(),
  scanned: z.boolean(),
  unreadable: z.boolean(),
  warnings: z.array(z.string()),
  /** Mean OCR word confidence per page, 0 to 100, in page order. Empty for a document with a text layer. */
  pageConfidence: z.array(z.number()),
  /** The file's size, which the message card states beside its name. */
  bytes: z.number(),
  /** `human` is a document a reviewer supplied for a case. It fills its place ahead of the sender's own. */
  origin: z.enum(["source", "human"]),
  /** Where the file and the text the parser read out of it sit in the store. Both stream from `/api/files/{key}`. */
  objectKey: z.string(),
  /** Null for a document the parser could not read, which is the same condition as `unreadable`. */
  textObjectKey: z.string().nullable(),
});
export type DocumentView = z.infer<typeof DocumentView>;
