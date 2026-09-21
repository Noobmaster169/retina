import type { EntityRow } from "@/lib/api/ontology-schemas";

/**
 * How a list of things is ordered, and how it is grouped when the order is
 * by country. Pure, so the choice in the URL means the same thing on cards
 * and in the table.
 */

export type SortKey = "emails" | "name" | "country" | "seen";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "emails", label: "Most emails" },
  { key: "country", label: "Country" },
  { key: "name", label: "Name" },
  { key: "seen", label: "Last seen" },
];

export function sortKeyOf(raw: string | null | undefined): SortKey {
  return SORT_OPTIONS.some((option) => option.key === raw) ? (raw as SortKey) : "emails";
}

const NO_COUNTRY = "￿";

function countryOf(row: EntityRow): string {
  return row.attributes.country ?? NO_COUNTRY;
}

export function sortRows(rows: EntityRow[], key: SortKey): EntityRow[] {
  const byName = (a: EntityRow, b: EntityRow) => a.name.localeCompare(b.name);
  const sorted = [...rows];
  if (key === "name") return sorted.sort(byName);
  if (key === "country") return sorted.sort((a, b) => countryOf(a).localeCompare(countryOf(b)) || b.emails - a.emails || byName(a, b));
  if (key === "seen") return sorted.sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "") || byName(a, b));
  return sorted.sort((a, b) => b.emails - a.emails || byName(a, b));
}

export interface CountryGroup {
  country: string | null;
  countryCode: string | null;
  rows: EntityRow[];
}

/** The rows in country order, each country once, the ones with no country last under their own heading. */
export function groupByCountry(rows: EntityRow[]): CountryGroup[] {
  const groups: CountryGroup[] = [];
  for (const row of sortRows(rows, "country")) {
    const country = row.attributes.country ?? null;
    const last = groups.at(-1);
    if (last && last.country === country) {
      last.rows.push(row);
      if (!last.countryCode && row.attributes.countryCode) last.countryCode = row.attributes.countryCode;
      continue;
    }
    groups.push({ country, countryCode: row.attributes.countryCode ?? null, rows: [row] });
  }
  return groups;
}
