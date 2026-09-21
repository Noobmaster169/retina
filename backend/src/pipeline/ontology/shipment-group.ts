import { Clusters } from "./clusters";

/**
 * Which emails are about one consignment.
 *
 * Two emails are one shipment when they share an identifier. Nothing looser:
 * not the same parties, not the same lane, not a similar reference. A shipper
 * sends the same customer the same goods on the same lane every week, so any
 * of those would fuse a year of trade into one thing, and an identifier is the
 * one fact in a shipping mail that is meant to be matched on.
 *
 * Pure, and the same union-find the spelling resolver uses: a reference shared
 * by A and B and another shared by B and C put all three together, which is
 * what a thread of instruction, draft and invoice query does in real mail.
 */

/** The five identifier columns of core.email_shipments, in the order a group's name reads best. */
export const REFERENCE_KEYS = ["oc_no", "bl_no", "booking_ref", "invoice_no", "po_no"] as const;
export type ReferenceKey = (typeof REFERENCE_KEYS)[number];

export interface ShipmentRead {
  emailId: string;
  refs: Partial<Record<ReferenceKey, string | null>>;
}

export interface ShipmentGroup {
  /** Sorted, so a group's identity does not depend on which email was read first. */
  emailIds: string[];
  /**
   * Every identifier the group's emails carry, as `oc_no:5RAE-00543`. The
   * column travels with the value because that is what was joined on, and a
   * stored ref that dropped it could not be matched against a later email
   * without guessing which kind of number it is.
   */
  refs: string[];
}

/** A reference is only a join when it is written. Whitespace is not an identifier. */
function usable(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The key a reference joins on. The column is part of it, so an invoice number
 * that happens to read like an order number does not join two shipments: they
 * are different kinds of number that happen to be spelled the same.
 */
function refKey(key: ReferenceKey, value: string): string {
  return `${key}:${value.trim()}`;
}

export function groupShipments(reads: ShipmentRead[]): ShipmentGroup[] {
  const clusters = new Clusters();
  const refsOf = new Map<string, string[]>();

  for (const read of reads) {
    const email = `email:${read.emailId}`;
    clusters.add(email);
    const keys: string[] = [];
    for (const key of REFERENCE_KEYS) {
      const value = read.refs[key];
      if (!usable(value)) continue;
      const node = refKey(key, value);
      clusters.add(node);
      clusters.union(email, node);
      keys.push(node);
    }
    refsOf.set(email, keys);
  }

  const groups = new Map<string, ShipmentGroup>();
  for (const read of reads) {
    const email = `email:${read.emailId}`;
    const root = clusters.find(email);
    const group = groups.get(root) ?? { emailIds: [], refs: [] };
    group.emailIds.push(read.emailId);
    for (const ref of refsOf.get(email) ?? []) if (!group.refs.includes(ref)) group.refs.push(ref);
    groups.set(root, group);
  }

  return [...groups.values()].map((group) => ({
    emailIds: [...group.emailIds].sort(),
    refs: [...group.refs].sort(byKeyThenValue),
  }));
}

function byKeyThenValue(a: string, b: string): number {
  const left = readRef(a);
  const right = readRef(b);
  const order = REFERENCE_KEYS.indexOf(left.key) - REFERENCE_KEYS.indexOf(right.key);
  return order !== 0 ? order : left.value.localeCompare(right.value);
}

/** What the page says instead of a column name. */
const REFERENCE_WORDS: Record<ReferenceKey, string> = {
  oc_no: "order",
  bl_no: "bill of lading",
  booking_ref: "booking",
  invoice_no: "invoice",
  po_no: "purchase order",
};

/** A stored ref split back into the kind of number it is and the number itself. */
export function readRef(ref: string): { key: ReferenceKey; label: string; value: string } {
  const cut = ref.indexOf(":");
  const key = ref.slice(0, cut) as ReferenceKey;
  return { key, label: REFERENCE_WORDS[key] ?? key, value: ref.slice(cut + 1) };
}
