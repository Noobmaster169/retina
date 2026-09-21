"use client";

import { useSearchParams } from "next/navigation";

import { DataTable } from "@/components/business/data-table";
import { EntityCard } from "@/components/business/entity-card";
import { FilterBar } from "@/components/business/filter-bar";
import { hrefFor } from "@/components/business/kind";
import { ListPage } from "@/components/business/list-page";
import { useView } from "@/components/business/use-view";
import { ViewToggle } from "@/components/business/view-toggle";
import type { EntityRow } from "@/lib/api/ontology-schemas";

import { COMPANY_COLUMNS, roleCounts } from "./company-columns";

const VIEWS = ["cards", "table"] as const;

/** Filtered in the browser: a company list is a few hundred rows at most, and the API already sent them all. */
export function CompanyList({ rows }: { rows: EntityRow[] }) {
  const params = useSearchParams();
  const [view, setView] = useView("company", VIEWS);
  const q = (params.get("q") ?? "").toLowerCase();
  const country = params.get("country") ?? "";
  const kind = params.get("kind") ?? "";
  const shown = rows.filter(
    (row) =>
      (!q || row.name.toLowerCase().includes(q) || (row.summary ?? "").toLowerCase().includes(q)) &&
      (!country || row.attributes.country === country) &&
      (!kind || row.attributes.kind === kind),
  );
  const options = (key: string) =>
    [...new Set(rows.map((row) => row.attributes[key]).filter((value): value is string => !!value))]
      .sort()
      .map((value) => ({ value, label: value }));

  return (
    <ListPage
      crumb="Companies"
      title="Companies"
      lede="Every shipper, consignee and notify party the mail named, resolved across its spellings, with what the mail shows about each."
      toolbar={
        <>
          <FilterBar
            placeholder="Search companies"
            selects={[
              { param: "country", label: "Country", options: options("country") },
              { param: "kind", label: "Kind", options: options("kind") },
            ]}
            shown={shown.length}
            total={rows.length}
          />
          <ViewToggle
            views={[
              { key: "cards", label: "Cards", icon: "cards" },
              { key: "table", label: "Table", icon: "table" },
            ]}
            current={view}
            onChange={setView}
          />
        </>
      }
    >
      {view === "cards" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((row) => (
            <EntityCard
              key={row.id}
              type="party"
              href={hrefFor("party", row.id) ?? "#"}
              name={row.name}
              summary={row.summary}
              chips={[row.attributes.kind, row.attributes.country].filter((value): value is string => !!value)}
              counts={roleCounts(row)}
              lastSeen={row.lastSeen}
            />
          ))}
          {shown.length === 0 ? <p className="col-span-full py-10 text-center text-body text-ink-tertiary">No company matches.</p> : null}
        </div>
      ) : (
        <DataTable columns={COMPANY_COLUMNS} rows={shown} keyOf={(r) => r.id} hrefOf={(r) => hrefFor("party", r.id)} empty="No company matches." />
      )}
    </ListPage>
  );
}
