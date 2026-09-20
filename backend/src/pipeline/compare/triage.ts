import type { AttachmentRole, DocType } from "../../contracts";

export type TriageRequest = "send_draft" | "compare_documents";

export interface TriageAttachment {
  filename: string;
  role: AttachmentRole;
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
  /** `human` is a file a reviewer supplied for a case. Absent reads as the sender's own. */
  origin?: "source" | "human";
}

export interface ResolvedRoles {
  attachments: TriageAttachment[];
  /** A pair the model read the other way round and this put back. Said out loud rather than done quietly. */
  swapped: boolean;
}

/**
 * Which file plays which part. The filename's claim comes first; a file that
 * claims nothing takes the model's word when that names an SI or a BL; and a
 * pair the model reads the other way round is swapped. A file left UNKNOWN
 * here plays no part: it came along with the pair rather than filling a place
 * in it.
 *
 * A document a reviewer supplied fills its place ahead of the sender's own. A
 * person uploads one because the file that arrived could not be used, so the
 * upload is an answer to that and not a second candidate to choose between.
 */
export function resolveRoles(docs: RoledDocument[]): ResolvedRoles {
  const roleOf = (doc: RoledDocument): AttachmentRole => {
    if (doc.role !== "UNKNOWN") return doc.role;
    return doc.docType === "SI" || doc.docType === "BL" ? doc.docType : "UNKNOWN";
  };
  const roled = docs.map((doc) => ({ filename: doc.filename, role: roleOf(doc), docType: doc.docType, origin: doc.origin ?? "source" }));
  const fills = (role: AttachmentRole) =>
    roled.find((doc) => doc.role === role && doc.origin === "human") ?? roled.find((doc) => doc.role === role);
  const si = fills("SI");
  const bl = fills("BL");
  const crossed = Boolean(si && bl && si.docType === "BL" && bl.docType === "SI");
  if (crossed && si && bl) {
    si.role = "BL";
    bl.role = "SI";
  }
  // Only one file fills each place. A second claimant travelled with the pair
  // rather than being part of it, which is what UNKNOWN already means here.
  for (const doc of roled) {
    if (doc !== si && doc !== bl && doc.role !== "UNKNOWN") doc.role = "UNKNOWN";
  }
  return { attachments: roled.map(({ filename, role }) => ({ filename, role })), swapped: crossed };
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
