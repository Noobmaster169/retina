import type { Column } from "@/components/business/data-table";
import type { EntityRow } from "@/lib/api/ontology-schemas";
import { Flag } from "@/components/ui/flag";

const unknown = <span className="text-ink-faint">unknown</span>;

export const PORT_COLUMNS: Column<EntityRow>[] = [
  { key: "name", label: "Port", sort: (r) => r.name, cell: (r) => (
      <span className="inline-flex items-center gap-2 font-medium text-kind-port">
        <Flag code={r.attributes.countryCode} height={12} />
        {r.name}
      </span>
    ),
  },
  { key: "locode", label: "Locode", width: "90px", mono: true, sort: (r) => r.attributes.locode ?? "", cell: (r) => r.attributes.locode ?? "" },
  { key: "country", label: "Country", width: "160px", sort: (r) => r.attributes.country ?? "", cell: (r) => r.attributes.country ?? unknown },
  {
    key: "region",
    label: "Region",
    width: "160px",
    sort: (r) => r.attributes.subregion ?? r.attributes.region ?? "",
    cell: (r) => r.attributes.subregion ?? r.attributes.region ?? "",
  },
  { key: "loading", label: "Loading", width: "90px", mono: true, sort: (r) => r.roles.port_of_loading ?? 0, cell: (r) => r.roles.port_of_loading ?? 0 },
  {
    key: "discharge",
    label: "Discharge",
    width: "100px",
    mono: true,
    sort: (r) => r.roles.port_of_discharge ?? 0,
    cell: (r) => r.roles.port_of_discharge ?? 0,
  },
  {
    key: "located",
    label: "On the map",
    width: "100px",
    cell: (r) => (r.attributes.lat && r.attributes.lon ? "yes" : <span className="text-ink-faint">not yet</span>),
  },
];
