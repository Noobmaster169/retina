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
        className={`truncate font-medium text-kind-port hover:underline ${compact ? "max-w-[140px]" : ""}`}
      >
        {ref.name}
      </Link>
    ) : (
      <span className="text-ink-faint">{fallback}</span>
    );
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-small">
      {port(pol, "no loading port")}
      <Icon name="chevron" size={11} className="shrink-0 text-ink-faint" />
      {port(pod, "no discharge port")}
    </span>
  );
}
