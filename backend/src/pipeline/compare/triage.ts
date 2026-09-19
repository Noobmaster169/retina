import type { AttachmentRole, DocType } from "../../contracts";

export type TriageRequest = "send_draft" | "compare_documents";

export interface TriageAttachment {
  filename: string;
  role: AttachmentRole;
  bytes: number;
}

export interface TriageInput {
  /**
   * The model's reading of what the sender asks for. Needed only when nothing
   * is attached: with files in hand, which roles are present is a fact and
   * code decides on it.
   */
  request: TriageRequest | null;
  attachments: TriageAttachment[];
}

export type TriageResult =
  | { kind: "compare"; si: string; bl: string; extras: string[] }
  | { kind: "awaiting_draft"; note: string }
  | { kind: "missing_attachment"; missing: ("SI" | "BL")[]; note: string };

export interface RoledDocument {
  filename: string;
  /** What the filename claims. */
  role: AttachmentRole;
  /** What the model said the document is, or null where it could not read it or has not yet. */
  docType: DocType | null;
  bytes: number;
}

/**
 * Which file plays which part. The filename's claim comes first; a file that
 * claims nothing takes the model's word when that names an SI or a BL; and a
 * pair the model reads the other way round is swapped.
 */
export function resolveRoles(docs: RoledDocument[]): TriageAttachment[] {
  const roleOf = (doc: RoledDocument): AttachmentRole => {
    if (doc.role !== "UNKNOWN") return doc.role;
    return doc.docType === "SI" || doc.docType === "BL" ? doc.docType : "UNKNOWN";
  };
  const roled = docs.map((doc) => ({ filename: doc.filename, bytes: doc.bytes, role: roleOf(doc), docType: doc.docType }));
  const si = roled.find((doc) => doc.role === "SI");
  const bl = roled.find((doc) => doc.role === "BL");
  const crossed = si && bl && si.docType === "BL" && bl.docType === "SI";
  if (crossed) {
    si.role = "BL";
    bl.role = "SI";
  }
  return roled.map(({ filename, role, bytes }) => ({ filename, role, bytes }));
}

/**
 * Whether there is a pair to compare. Which attachments are present is a fact
 * and code decides on it; what an email with none is asking for is a reading
 * of the email, and that reading is passed in as the model's answer.
 */
export function triage(input: TriageInput): TriageResult {
  const si = input.attachments.find((file) => file.role === "SI");
  const bl = input.attachments.find((file) => file.role === "BL");
  if (si && bl) {
    const extras = input.attachments.filter((file) => file !== si && file !== bl).map((file) => file.filename);
    return { kind: "compare", si: si.filename, bl: bl.filename, extras };
  }

  if (input.attachments.length === 0) {
    if (input.request === "send_draft") {
      return { kind: "awaiting_draft", note: "the sender asks for the draft BL to be sent; there is nothing to compare yet" };
    }
    if (input.request === "compare_documents") {
      return { kind: "missing_attachment", missing: ["SI", "BL"], note: "a comparison was asked for and nothing was attached" };
    }
    throw new Error("triage of an email with nothing attached needs the model's reading of the request");
  }

  const missing: ("SI" | "BL")[] = [...(si ? [] : ["SI" as const]), ...(bl ? [] : ["BL" as const])];
  const names = input.attachments.map((file) => file.filename).join(", ");
  return { kind: "missing_attachment", missing, note: `attached: ${names}; no ${missing.join(" or ")} among them` };
}
