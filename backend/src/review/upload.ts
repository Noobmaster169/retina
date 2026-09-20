import { createHash } from "node:crypto";

import type { ReviewActionResult, UploadBody } from "../contracts";
import { TerminalError } from "../lib/errors";
import { attachments, documents } from "../ontology/repositories";
import { keys } from "../storage";
import type { ObjectStore } from "../storage";
import { applyEffect, checkState, findCase, type ReviewDeps } from "./actions";

/**
 * A document a person supplied because the one that arrived could not be used.
 * It is stored under the case that asked for it, marked as theirs, and the
 * email goes back through the compare stage from triage, where a human-origin
 * file fills its place ahead of the sender's.
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** The four formats doc-extract reads. Anything else would be stored and then found unreadable. */
const ALLOWED = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain; charset=utf-8",
} as const;

type Extension = keyof typeof ALLOWED;

function extensionOf(filename: string): Extension {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension && extension in ALLOWED) return extension as Extension;
  throw new TerminalError(`Retina reads ${Object.keys(ALLOWED).join(", ")}; ${filename} is none of them`);
}

/**
 * Whether the bytes are the kind the name claims. A file renamed to .pdf is
 * caught here rather than three stages later as an unreadable document, and
 * the reviewer is told which of the two is wrong.
 */
function checkMagic(extension: Extension, bytes: Buffer): void {
  if (extension === "pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new TerminalError("this file is named .pdf and does not begin like one");
  }
  if ((extension === "docx" || extension === "xlsx") && !bytes.subarray(0, 2).equals(Buffer.from("PK"))) {
    throw new TerminalError(`this file is named .${extension} and is not a zip, which every Office file is`);
  }
  if (extension === "txt" && !Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) {
    throw new TerminalError("this file is named .txt and is not valid UTF-8");
  }
}

export interface UploadedFile {
  filename: string;
  bytes: Buffer;
}

export interface UploadDeps extends ReviewDeps {
  /** Null where object storage is not configured; an upload then answers 503. */
  store: ObjectStore | null;
}

export async function applyUpload(deps: UploadDeps, caseId: string, body: UploadBody, file: UploadedFile): Promise<ReviewActionResult | null> {
  const at = await findCase(deps, caseId);
  if (!at) return null;
  checkState(at, "upload");

  const extension = extensionOf(file.filename);
  if (file.bytes.length === 0) throw new TerminalError("this file is empty");
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new TerminalError(`this file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
  checkMagic(extension, file.bytes);

  const key = keys.upload(at.id, file.filename);
  if (!deps.store) throw new TerminalError("object storage is not configured, so there is nowhere to put this file");
  await deps.store.put(key, file.bytes, ALLOWED[extension]);

  return applyEffect(deps, at, { kind: "upload", actor: body.actor, note: body.note }, async (tx) => {
    const attachmentId = await attachments.insertFromPerson(tx, {
      runId: at.runId,
      emailId: at.emailId,
      filename: file.filename,
      sourcePath: key,
      role: body.role,
      objectKey: key,
      contentType: ALLOWED[extension],
      bytes: file.bytes.length,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
      reviewCaseId: at.id,
    });
    // A second upload under the same name is different bytes, so what was read
    // from the file it replaced must not stand in for it.
    await documents.forget(tx, attachmentId);
    return {
      row: { field: null, side: body.role, oldValue: null, newValue: file.filename },
      rerun: "triage",
      wrote: `Stored ${file.filename} as the ${body.role} of ${at.emailId}.`,
    };
  });
}
