/** The map's arithmetic, apart from the drawing so it can be tested. */

export interface Locatable {
  id: string;
  name: string;
  attributes: Record<string, string | null>;
}

export interface Located<T> {
  row: T;
  id: string;
  lat: number;
  lon: number;
}

/** Pin radius in viewBox units: square root of the count so a port with four times the shipments is twice the pin, never four times. Small, so a busy coast still shows its coast. */
export function radiusFor(count: number, max: number): number {
  if (max <= 0) return 2;
  return 2 + 5 * Math.sqrt(Math.max(0, count) / max);
}

export function located<T extends Locatable>(rows: T[]): Located<T>[] {
  const out: Located<T>[] = [];
  for (const row of rows) {
    if (row.attributes.lat == null || row.attributes.lon == null) continue;
    const lat = Number(row.attributes.lat);
    const lon = Number(row.attributes.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    out.push({ row, id: row.id, lat, lon });
  }
  return out;
}
