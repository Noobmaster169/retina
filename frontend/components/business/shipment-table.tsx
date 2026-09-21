"use client";

import Link from "next/link";

import { Chip } from "@/components/ui/chip";
import type { ShipmentRow } from "@/lib/api/shipments-schemas";
import { formatWhen } from "@/lib/when";

import { type Column, DataTable } from "./data-table";
import { hrefFor } from "./kind";
import { ShipmentLane } from "./shipment-lane";

function party(ref: { id: string; name: string } | null) {
  if (!ref) return <span className="text-ink-faint">unknown</span>;
  return (
    <Link href={hrefFor("party", ref.id) ?? "#"} onClick={(event) => event.stopPropagation()} className="text-kind-company hover:underline">
      {ref.name}
    </Link>
  );
}

const none = <span className="text-ink-faint">none</span>;

export const SHIPMENT_COLUMNS: Column<ShipmentRow>[] = [
  {
    key: "ref",
    label: "Reference",
    width: "150px",
    mono: true,
    sort: (r) => r.ocNo ?? r.blNo ?? "",
    cell: (r) => r.ocNo ?? r.blNo ?? r.bookingRef ?? r.emailId,
  },
  { key: "shipper", label: "Shipper", sort: (r) => r.shipper?.name ?? null, cell: (r) => party(r.shipper) },
  { key: "consignee", label: "Consignee", sort: (r) => r.consignee?.name ?? null, cell: (r) => party(r.consignee) },
  { key: "lane", label: "Lane", width: "280px", cell: (r) => <ShipmentLane pol={r.pol} pod={r.pod} compact /> },
  {
    key: "vessel",
    label: "Vessel",
    width: "160px",
    cell: (r) => (r.vessel ? `${r.vessel.name}${r.voyage ? ` ${r.voyage}` : ""}` : <span className="text-ink-faint">none stated</span>),
  },
  {
    key: "date",
    label: "Mail date",
    width: "110px",
    sort: (r) => r.mailDate ?? "",
    cell: (r) => (r.mailDate ? formatWhen(r.mailDate, false) : <span className="text-ink-faint">not stated</span>),
  },
  {
    key: "disputed",
    label: "Disputed",
    width: "150px",
    sort: (r) => r.disputedFields.length,
    cell: (r) =>
      r.disputedFields.length ? (
        <Chip tone="differ" mono>
          {r.disputedFields.join(", ")}
        </Chip>
      ) : (
        none
      ),
  },
];

export function ShipmentTable({
  rows,
  columns = SHIPMENT_COLUMNS,
  minWidth = 1080,
  empty = "No shipment has been read yet.",
}: {
  rows: ShipmentRow[];
  columns?: Column<ShipmentRow>[];
  minWidth?: number;
  empty?: string;
}) {
  return (
    <DataTable
      columns={columns}
      minWidth={minWidth}
      rows={rows}
      keyOf={(r) => r.emailId}
      hrefOf={(r) => `/shipment/${encodeURIComponent(r.emailId)}`}
      empty={empty}
    />
  );
}
