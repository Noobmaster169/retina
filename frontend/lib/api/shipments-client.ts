import { ShipmentDetail, ShipmentList, type ShipmentQuery } from "./shipments-schemas";
import { get } from "./transport";

export type { ShipmentDetail, ShipmentList, ShipmentQuery, ShipmentRef, ShipmentRow } from "./shipments-schemas";

function queryString(params: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(params).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== "",
  );
  return pairs.length ? `?${new URLSearchParams(pairs.map(([k, v]) => [k, String(v)])).toString()}` : "";
}

/** Shipments as the mail states them, filtered by party, port, dispute or a reference prefix. */
export async function listShipments(query: ShipmentQuery = {}): Promise<ShipmentList> {
  return get(ShipmentList, `/shipments${queryString({ ...query })}`);
}

/** Null when nothing was read from that email. */
export async function getShipment(emailId: string): Promise<ShipmentDetail | null> {
  try {
    return await get(ShipmentDetail, `/shipments/${encodeURIComponent(emailId)}`);
  } catch (error) {
    if (error instanceof Error && /→ 404$/.test(error.message)) return null;
    throw error;
  }
}
