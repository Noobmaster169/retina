import type { Column } from "@/components/business/data-table";
import type { EntityRow } from "@/lib/api/ontology-schemas";
import { Flag } from "@/components/ui/flag";
import { formatWhenShort } from "@/lib/when";

const unknown = <span className="text-ink-faint">unknown</span>;

export function roleCounts(row: EntityRow): { label: string; value: number }[] {
  return [
    { label: "shipper", value: row.roles.shipper ?? 0 },
    { label: "consignee", value: row.roles.consignee ?? 0 },
    { label: "notify", value: row.roles.notify_party ?? 0 },
  ];
}

export const COMPANY_COLUMNS: Column<EntityRow>[] = [
  { key: "name", label: "Company", sort: (r) => r.name, cell: (r) => (
      <span className="inline-flex items-center gap-2 font-medium text-kind-company">
        <Flag code={r.attributes.countryCode} height={12} />
        {r.name}
      </span>
    ),
  },
  { key: "kind", label: "Kind", width: "140px", sort: (r) => r.attributes.kind ?? "", cell: (r) => r.attributes.kind ?? unknown },
  {
    key: "where",
    label: "Where",
    width: "180px",
    sort: (r) => r.attributes.country ?? "",
    cell: (r) => [r.attributes.city, r.attributes.country].filter(Boolean).join(", ") || unknown,
  },
  { key: "shipper", label: "Shipper", width: "90px", mono: true, sort: (r) => r.roles.shipper ?? 0, cell: (r) => r.roles.shipper ?? 0 },
  { key: "consignee", label: "Consignee", width: "100px", mono: true, sort: (r) => r.roles.consignee ?? 0, cell: (r) => r.roles.consignee ?? 0 },
  { key: "emails", label: "Emails", width: "80px", mono: true, sort: (r) => r.emails, cell: (r) => r.emails },
  { key: "seen", label: "Last seen", width: "110px", sort: (r) => r.lastSeen ?? "", cell: (r) => (r.lastSeen ? formatWhenShort(r.lastSeen) : "") },
];
