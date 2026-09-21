import type { ReactNode } from "react";

import { Flag } from "@/components/ui/flag";
import type { EntityRow } from "@/lib/api/ontology-schemas";

import { groupByCountry } from "./sort";

/**
 * Cards under one heading per country, the flag beside it, when the list is
 * sorted by country.
 *
 * `card` is given the row's place in the whole list and not in its group, so
 * whatever the caller does with the first few of a list, such as fetching
 * their pages ahead of the click, it does for the first few and not for the
 * first few of every country.
 */
export function CountryGroups({ rows, card }: { rows: EntityRow[]; card(row: EntityRow, at: number): ReactNode }) {
  let at = 0;
  return (
    <div className="space-y-6">
      {groupByCountry(rows).map((group) => (
        <section key={group.country ?? "none"}>
          <h2 className="mb-2 flex items-center gap-2 text-heading font-medium">
            <Flag code={group.countryCode} height={13} />
            {group.country ?? "Country not known yet"}
            <span className="font-mono text-mono-sm font-normal text-ink-tertiary">{group.rows.length}</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {group.rows.map((row) => card(row, at++))}
          </div>
        </section>
      ))}
    </div>
  );
}
