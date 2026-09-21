"use client";

import { useSearchParams } from "next/navigation";

import { DataTable } from "@/components/business/data-table";
import { EntityCard } from "@/components/business/entity-card";
import { FilterBar } from "@/components/business/filter-bar";
import { hrefFor } from "@/components/business/kind";
import { LIST_COPY } from "@/components/business/list-copy";
import { ListPage } from "@/components/business/list-page";
import { MoreBelow } from "@/components/business/more-below";
import { CARD_STEP, EAGER_CARDS, TABLE_STEP } from "@/components/business/soft-page";
import { useSoftPage } from "@/components/business/use-soft-page";
import { located } from "@/components/business/map-scale";
import { CountryGroups } from "@/components/business/country-groups";
import { sortKeyOf, sortRows } from "@/components/business/sort";
import { SortSelect } from "@/components/business/sort-select";
import { useView } from "@/components/business/use-view";
import { ViewToggle } from "@/components/business/view-toggle";
import { type MapLane, type MapPin, WorldMap } from "@/components/business/map/world-map";
import type { EntityRow, Lane } from "@/lib/api/ontology-schemas";

import { PORT_COLUMNS } from "./port-columns";

const VIEWS = ["map", "cards", "table"] as const;

function pinOf(row: EntityRow, lat: number, lon: number): MapPin {
  const loading = row.roles.port_of_loading ?? 0;
  const discharge = row.roles.port_of_discharge ?? 0;
  return {
    id: row.id,
    name: row.name,
    lat,
    lon,
    count: loading + discharge,
    href: hrefFor("port", row.id) ?? "#",
    loading,
    discharge,
    countryCode: row.attributes.countryCode,
    locode: row.attributes.locode,
    country: row.attributes.country,
  };
}

const laneOf = (lane: Lane): MapLane => ({ polId: lane.pol.id, podId: lane.pod.id, count: lane.count, disputed: lane.disputed });

export function PortList({ rows, lanes }: { rows: EntityRow[]; lanes: Lane[] }) {
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
  // Every located port goes to the map and the filter says which are shown,
  // so a port outside the filter can still appear as the far end of a lane.
  const pins = located(rows).map((item) => pinOf(item.row, item.lat, item.lon));
  const visible = new Set(shown.map((row) => row.id));
  const unplaced = shown.filter((row) => !pins.some((pin) => pin.id === row.id));
  // The map keeps every pin; only the cards and the table grow with the scroll.
  const page = useSoftPage(shown, view === "cards" ? CARD_STEP : TABLE_STEP, `${view}|${sort}|${q}|${region}|${role}`);
  const regions = [...new Set(rows.map((row) => row.attributes.region).filter((value): value is string => !!value))]
    .sort()
    .map((value) => ({ value, label: value }));

  const card = (row: EntityRow, at: number) => (
      <EntityCard
        key={row.id}
        eager={at < EAGER_CARDS}
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
      {...LIST_COPY.port}
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
          <WorldMap pins={pins} lanes={lanes.map(laneOf)} visible={[...visible]} />
          {unplaced.length ? (
            <p className="text-small text-ink-tertiary">
              Not located yet: {unplaced.map((row) => row.name).join(", ")}. The world&apos;s port list places a port by the words
              of its name, and these it does not know.
            </p>
          ) : null}
        </div>
      ) : view === "cards" ? (
        shown.length === 0 ? (
          <p className="py-10 text-center text-body text-ink-tertiary">No port matches.</p>
        ) : sort === "country" ? (
          <CountryGroups rows={page.shown} card={card} />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{page.shown.map(card)}</div>
        )
      ) : (
        <DataTable columns={PORT_COLUMNS} rows={page.shown} keyOf={(r) => r.id} hrefOf={(r) => hrefFor("port", r.id)} empty="No port matches." />
      )}
      {view === "map" ? null : <MoreBelow rest={page.rest} sentinel={page.sentinel} />}
    </ListPage>
  );
}
