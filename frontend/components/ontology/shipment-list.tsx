import Link from "next/link";

import { Chip } from "@/components/ui/chip";
import type { ConsignmentRow } from "@/lib/api/shipment-schemas";

/**
 * The consignments the mail is about. One row says enough to tell two apart:
 * what it is filed under, where it goes, who receives it and whether anything
 * about it is disputed.
 *
 * The email count is on every row rather than only where it is interesting,
 * because "1 email" is the honest state of this inbox and hiding it would
 * imply a thread that is not there.
 *
 * Two lines rather than five columns: this list sits between two rails, and a
 * lane and a consignee are both longer than the width a column of them gets.
 */

interface ShipmentListProps {
  shipments: ConsignmentRow[];
  openId: string | null;
  hrefFor: (id: string) => string;
}

export function ShipmentList({ shipments, openId, hrefFor }: ShipmentListProps) {
  if (shipments.length === 0) {
    return (
      <div className="flex min-h-0 grow items-center justify-center bg-surface">
        <p className="max-w-[52ch] text-center text-strong text-ink-tertiary">
          No shipment yet. One appears for every email the ontology job has read, within a minute of it being read.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 grow overflow-y-auto">
      <ul>
        {shipments.map((row) => (
          <li key={row.id}>
            <Link
              href={hrefFor(row.id)}
              className={`block border-b border-hairline-faint px-7 py-3 hover:bg-sunken ${
                openId === row.id ? "bg-active" : ""
              }`}
            >
              <div className="flex items-baseline gap-2">
                {row.refs.length === 0 ? (
                  <span className="text-small text-ink-faint">filed under no number</span>
                ) : (
                  <>
                    <span className="font-mono text-mono-sm text-ink">{row.refs[0].value}</span>
                    <span className="shrink-0 text-caption text-ink-tertiary">
                      {row.refs[0].label}
                      {row.refs.length > 1 ? ` and ${row.refs.length - 1} more` : ""}
                    </span>
                  </>
                )}
                <span className="grow" />
                <span className="shrink-0 text-caption text-ink-tertiary">
                  {row.emails} email{row.emails === 1 ? "" : "s"}
                </span>
                <span className="shrink-0 font-mono text-mono-xs text-ink-faint">{row.lastMailDate ?? ""}</span>
              </div>

              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="min-w-0 truncate text-small text-ink-secondary">
                  {row.lane ? (
                    <>
                      {row.lane.from} <span className="text-ink-faint">to</span> {row.lane.to}
                    </>
                  ) : (
                    <span className="text-ink-faint">no lane stated</span>
                  )}
                </span>
                {row.consignee || row.commodity ? (
                  <span className="min-w-0 truncate text-caption text-ink-tertiary">
                    {row.consignee ?? row.commodity}
                  </span>
                ) : null}
                <span className="grow" />
                {row.disputedFields.length > 0 ? (
                  <Chip tone="differ">
                    {row.disputedFields.length} field{row.disputedFields.length === 1 ? "" : "s"} differ
                  </Chip>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
