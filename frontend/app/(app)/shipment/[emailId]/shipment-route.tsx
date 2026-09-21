import Link from "next/link";

import { hrefFor } from "@/components/business/kind";
import { RouteMap } from "@/components/business/map/route-map";
import { Flag } from "@/components/ui/flag";
import type { ShipmentRef } from "@/lib/api/shipments-schemas";

export interface RoutePort {
  ref: ShipmentRef;
  lat: number | null;
  lon: number | null;
  countryCode: string | null;
}

function End({ label, port, end = false }: { label: string; port: RoutePort | null; end?: boolean }) {
  return (
    <div className={`min-w-0 ${end ? "sm:text-right" : ""}`}>
      <p className="text-caption text-ink-tertiary">{label}</p>
      {port ? (
        <Link href={hrefFor("port", port.ref.id) ?? "#"} className={`flex items-center gap-2 text-body font-medium text-kind-port hover:underline ${end ? "sm:justify-end" : ""}`}>
          <Flag code={port.countryCode} height={12} />
          <span className="min-w-0 truncate">{port.ref.name}</span>
        </Link>
      ) : (
        <p className="text-body text-ink-faint">not stated</p>
      )}
    </div>
  );
}

/** Where the cargo goes: the lane drawn on a small map, with both ends named under it. */
export function ShipmentRoute({ pol, pod, vessel }: { pol: RoutePort | null; pod: RoutePort | null; vessel: string | null }) {
  const placed = (port: RoutePort | null) => (port && port.lat !== null && port.lon !== null ? { name: port.ref.name, lat: port.lat, lon: port.lon } : null);
  const from = placed(pol);
  const to = placed(pod);
  return (
    <section className="overflow-hidden rounded-lg border border-hairline">
      {from && to ? (
        <RouteMap from={from} to={to} />
      ) : (
        <p className="bg-sunken px-4 py-6 text-center text-small text-ink-tertiary">
          {pol && pod
            ? "One end of this lane is not on the map yet, so the route is not drawn."
            : "The mail does not name both ports, so there is no route to draw."}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 border-t border-hairline px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
        <End label="Port of loading" port={pol} />
        <span className="hidden pb-0.5 font-mono text-mono-sm text-ink-faint sm:block">{vessel ?? "to"}</span>
        <End label="Port of discharge" port={pod} end />
      </div>
    </section>
  );
}
