"use client";

import Link from "next/link";

import type { Column } from "@/components/business/data-table";
import { hrefFor } from "@/components/business/kind";
import { SHIPMENT_COLUMNS, ShipmentTable } from "@/components/business/shipment-table";
import type { ShipmentRef, ShipmentRow } from "@/lib/api/shipments-schemas";

/** The shared columns this table keeps, with the width each gets here. */
const KEPT: Record<string, string> = { ref: "120px", shipper: "", consignee: "", date: "110px", disputed: "130px" };

function port(ref: ShipmentRef | null) {
  if (!ref) return <span className="text-ink-faint">not stated</span>;
  return (
    <Link href={hrefFor("port", ref.id) ?? "#"} onClick={(event) => event.stopPropagation()} className="font-medium text-kind-port hover:underline">
      {ref.name}
    </Link>
  );
}

/**
 * The shipment table on a port's page. One end of every lane is this port,
 * so the lane column names only the far end, `end`, and the vessel gives way
 * so the parties have room to be read.
 */
function columnsFor(end: "pol" | "pod"): Column<ShipmentRow>[] {
  const other: Column<ShipmentRow> = {
    key: "other",
    label: end === "pod" ? "Discharging at" : "Loaded at",
    width: "200px",
    sort: (r) => r[end]?.name ?? null,
    cell: (r) => port(r[end]),
  };
  const kept = SHIPMENT_COLUMNS.filter((column) => column.key in KEPT).map((column) => ({ ...column, width: KEPT[column.key] || undefined }));
  return [...kept.slice(0, 3), other, ...kept.slice(3)];
}

export function PortShipments({ rows, end, empty }: { rows: ShipmentRow[]; end: "pol" | "pod"; empty: string }) {
  return <ShipmentTable rows={rows} columns={columnsFor(end)} minWidth={820} empty={empty} />;
}
