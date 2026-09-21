import Link from "next/link";

import { ShipmentLane } from "@/components/business/shipment-lane";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icons";
import type { ShipmentRow } from "@/lib/api/shipments-schemas";
import { formatWhenShort } from "@/lib/when";

/** One shipment as a card: the reference, the lane, the two parties, and the cargo line. */
export function ShipmentCard({ row }: { row: ShipmentRow }) {
  const reference = row.ocNo ?? row.blNo ?? row.bookingRef ?? row.emailId;
  return (
    <Link
      href={`/shipment/${encodeURIComponent(row.emailId)}`}
      className="flex flex-col gap-2.5 rounded-lg border border-hairline bg-canvas p-4 transition-colors duration-150 hover:border-hairline-strong hover:bg-surface"
    >
      <div className="flex items-center gap-2">
        <Icon name="ship" size={14} className="text-kind-shipment" />
        <span className="font-mono text-mono text-kind-shipment">{reference}</span>
        <span className="grow" />
        {row.disputedFields.length ? <Chip tone="differ">{row.disputedFields.length} disputed</Chip> : null}
      </div>
      <ShipmentLane pol={row.pol} pod={row.pod} />
      <div className="text-small text-ink-secondary">
        <span className="text-kind-company">{row.shipper?.name ?? "unknown shipper"}</span> to{" "}
        <span className="text-kind-company">{row.consignee?.name ?? "unknown consignee"}</span>
      </div>
      <div className="flex gap-3 text-caption text-ink-tertiary">
        {row.vessel ? (
          <span>
            {row.vessel.name}
            {row.voyage ? ` ${row.voyage}` : ""}
          </span>
        ) : null}
        {row.containerCount ? (
          <span>
            {row.containerCount} x {row.containerType ?? "container"}
          </span>
        ) : null}
        {row.mailDate ? <span>{formatWhenShort(row.mailDate)}</span> : null}
      </div>
    </Link>
  );
}
