import type { AttachmentRole } from "../contracts";

/** "Docs Team <docs@Fujitogrp.com>" and "docs@fujitogrp.com" both give "fujitogrp.com". */
export function senderDomain(from: string): string {
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  return address.slice(address.lastIndexOf("@") + 1).trim().toLowerCase();
}

/** Shipment size from a subject such as "COATED IVORY BOARD__138MT". Phase 9 uses it as a priority tiebreaker. */
export function parseTonnage(subject: string): number | null {
  const match = subject.match(/(\d{2,4})\s*MTS?\b/i);
  return match ? Number(match[1]) : null;
}

/**
 * What the filename claims the document is. A claim, not a fact: a file named
 * _BL can be an invoice, and the fingerprint in phase 5 is what checks.
 */
export function roleFromName(filename: string): AttachmentRole {
  if (/_SI\./i.test(filename)) return "SI";
  if (/_BL\./i.test(filename)) return "BL";
  return "UNKNOWN";
}
