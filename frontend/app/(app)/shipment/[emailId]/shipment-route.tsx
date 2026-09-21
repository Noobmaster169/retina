import { RouteMap } from "@/components/business/map/route-map";
import type { ShipmentRef } from "@/lib/api/shipments-schemas";

export interface RoutePort {
  ref: ShipmentRef;
  lat: number | null;
  lon: number | null;
}

const placed = (port: RoutePort | null) =>
  port && port.lat !== null && port.lon !== null ? { name: port.ref.name, lat: port.lat, lon: port.lon } : null;

/**
 * The lane as a small map under the cargo: a glance at where the cargo goes,
 * after the facts rather than before them. Absent when either end is not on
 * the map; the record still names both ports.
 */
export function ShipmentRoute({ pol, pod }: { pol: RoutePort | null; pod: RoutePort | null }) {
  const from = placed(pol);
  const to = placed(pod);
  if (!from || !to) return null;
  return (
    <section>
      <h2 className="mb-2 text-heading font-medium">Route</h2>
      <figure className="max-w-[420px] overflow-hidden rounded-md border border-hairline bg-canvas">
        <RouteMap from={from} to={to} />
        <figcaption className="flex items-center gap-3 border-t border-hairline px-2 py-1 text-caption text-ink-tertiary">
          <span className="flex items-center gap-1">
            <span aria-hidden className="h-2 w-2 rounded-full border-[1.5px] border-kind-port" />
            loading
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden className="h-2 w-2 rounded-full bg-kind-port" />
            discharge
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
