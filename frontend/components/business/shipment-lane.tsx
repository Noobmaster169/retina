"use client";

import Link from "next/link";

import { Icon } from "@/components/ui/icons";
import type { ShipmentRef } from "@/lib/api/shipments-schemas";

import { hrefFor } from "./kind";

/** Loading to discharge, each port a link, the line between them saying which is missing. */
export function ShipmentLane({ pol, pod, compact = false }: { pol: ShipmentRef | null; pod: ShipmentRef | null; compact?: boolean }) {
  const port = (ref: ShipmentRef | null, fallback: string) =>
    ref ? (
      <Link
        href={hrefFor("port", ref.id) ?? "#"}
        onClick={(event) => event.stopPropagation()}
        className={`font-medium text-kind-port hover:underline ${compact ? "min-w-0 truncate" : ""}`}
      >
        {ref.name}
      </Link>
    ) : (
      <span className={`text-ink-faint ${compact ? "min-w-0 truncate" : ""}`}>{fallback}</span>
    );
  return (
    // Compact shares the cell between both ends, each cut short with an
    // ellipsis; full size wraps instead, since there the lane is the point.
    <span className={`min-w-0 items-center gap-x-2 text-small ${compact ? "flex w-full" : "flex flex-wrap"}`}>
      {port(pol, "no loading port")}
      <Icon name="chevron" size={11} className="shrink-0 text-ink-faint" />
      {port(pod, "no discharge port")}
    </span>
  );
}
