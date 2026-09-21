"use client";

import { useSearchParams } from "next/navigation";

import { DataTable } from "@/components/business/data-table";
import { EntityCard } from "@/components/business/entity-card";
import { FilterBar } from "@/components/business/filter-bar";
import { hrefFor } from "@/components/business/kind";
import { ListPage } from "@/components/business/list-page";
import { located } from "@/components/business/map-scale";
import { CountryGroups } from "@/components/business/country-groups";
import { sortKeyOf, sortRows } from "@/components/business/sort";
import { SortSelect } from "@/components/business/sort-select";
import { useView } from "@/components/business/use-view";
import { ViewToggle } from "@/components/business/view-toggle";
import { type MapPin, WorldMap } from "@/components/business/world-map";
import type { EntityRow } from "@/lib/api/ontology-schemas";

import { PORT_COLUMNS } from "./port-columns";

const VIEWS = ["map", "cards", "table"] as const;

function pinOf(row: EntityRow, lat: number, lon: number): MapPin {
  const loading = row.roles.port_of_loading ?? 0;
  const discharge = row.roles.port_of_discharge ?? 0;
  return { id: row.id, name: row.name, lat, lon, count: loading + discharge, href: hrefFor("port", row.id) ?? "#", loading, discharge, countryCode: row.attributes.countryCode };
}

export function PortList({ rows }: { rows: EntityRow[] }) {
  const params = useSearchParams();
  const sort = sortKeyOf(params.get("sort"));
  const [view, setView] = useView("port", VIEWS);
  const q = (params.get("q") ?? "").toLowerCase();
  const region = params.get("region") ?? "";
  const role = params.get("role") ?? "";
  const shown = sortRows(
    rows.filter(
    (row) =>
      (!q || row.name.toLowerCase().includes(q) || (row.attributes.locode ?? "").toLowerCase().includes(q)) &&
      (!region || row.attributes.region === region) &&
      (!role || (row.roles[role] ?? 0) > 0),
    ),
    sort,
  );
  const pins = located(shown).map((item) => pinOf(item.row, item.lat, item.lon));
  const unplaced = shown.filter((row) => !pins.some((pin) => pin.id === row.id));
  const regions = [...new Set(rows.map((row) => row.attributes.region).filter((value): value is string => !!value))]
    .sort()
    .map((value) => ({ value, label: value }));

  const card = (row: EntityRow) => (
      <EntityCard
        key={row.id}
        type="port"
        href={hrefFor("port", row.id) ?? "#"}
        name={row.name}
        summary={row.summary}
        chips={[row.attributes.locode, row.attributes.country, row.attributes.subregion].filter((value): value is string => !!value)}
        counts={[
          { label: "loading", value: row.roles.port_of_loading ?? 0 },
          { label: "discharge", value: row.roles.port_of_discharge ?? 0 },
        ]}
        lastSeen={row.lastSeen}
        countryCode={row.attributes.countryCode}
      />
  );

  return (
    <ListPage
      crumb="Ports"
      title="Ports"
      lede="Every port the mail named as a place of loading or discharge, placed on the map once the locate step has found it."
      toolbar={
        <>
          <FilterBar
            placeholder="Search ports or locodes"
            selects={[
              { param: "region", label: "Region", options: regions },
              {
                param: "role",
                label: "Role",
                options: [
                  { value: "port_of_loading", label: "Loading" },
                  { value: "port_of_discharge", label: "Discharge" },
                ],
              },
            ]}
            shown={shown.length}
            total={rows.length}
          />
          <SortSelect current={sort} />
          <ViewToggle
            views={[
              { key: "map", label: "Map", icon: "map" },
              { key: "cards", label: "Cards", icon: "cards" },
              { key: "table", label: "Table", icon: "table" },
            ]}
            current={view}
            onChange={setView}
          />
        </>
      }
    >
      {view === "map" ? (
        <div className="space-y-4">
          <WorldMap pins={pins} />
          {unplaced.length ? (
            <p className="text-small text-ink-tertiary">
              Not located yet: {unplaced.map((row) => row.name).join(", ")}. The locate step places a port once its profile is
              written.
            </p>
          ) : null}
        </div>
      ) : view === "cards" ? (
        shown.length === 0 ? (
          <p className="py-10 text-center text-body text-ink-tertiary">No port matches.</p>
        ) : sort === "country" ? (
          <CountryGroups rows={shown} card={card} />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{shown.map(card)}</div>
        )
      ) : (
        <DataTable columns={PORT_COLUMNS} rows={shown} keyOf={(r) => r.id} hrefOf={(r) => hrefFor("port", r.id)} empty="No port matches." />
      )}
    </ListPage>
  );
}
