import { CounterpartList } from "@/components/business/counterpart-list";
import { hrefFor } from "@/components/business/kind";
import { located } from "@/components/business/map-scale";
import { type MapLane, type MapPin, WorldMap } from "@/components/business/map/world-map";
import { ProfileSummary } from "@/components/business/profile-summary";
import { ShipmentTable } from "@/components/business/shipment-table";
import { AppearanceList } from "@/components/database/appearance-list";
import { WrittenTheseWays } from "@/components/database/written-these-ways";
import type { Counterpart, EntityDetail, EntityRow, Lane } from "@/lib/api/ontology-schemas";
import type { ShipmentRow } from "@/lib/api/shipments-schemas";

const BY: Record<string, string> = { reference: "the world's port list", human: "a person", model: "the model", mail: "the mail" };

/** This port and every port a lane joins it to, as pins; the lanes between them. */
function around(id: string, ports: EntityRow[], lanes: Lane[]): { pins: MapPin[]; lanes: MapLane[] } {
  const mine = lanes.filter((lane) => lane.pol.id === id || lane.pod.id === id);
  const ends = new Set([id, ...mine.flatMap((lane) => [lane.pol.id, lane.pod.id])]);
  const pins = located(ports.filter((port) => ends.has(port.id))).map(({ row, lat, lon }) => ({
    id: row.id,
    name: row.name,
    lat,
    lon,
    count: (row.roles.port_of_loading ?? 0) + (row.roles.port_of_discharge ?? 0),
    href: row.id === id ? "#" : (hrefFor("port", row.id) ?? "#"),
    loading: row.roles.port_of_loading ?? 0,
    discharge: row.roles.port_of_discharge ?? 0,
    countryCode: row.attributes.countryCode,
    locode: row.attributes.locode,
    country: row.attributes.country,
  }));
  return { pins, lanes: mine.map((lane) => ({ polId: lane.pol.id, podId: lane.pod.id, count: lane.count, disputed: lane.disputed })) };
}

/** The body of a port page: where it sits and what it joins, what it is, what loads and discharges there, who uses it, where it was seen. */
export function PortSections({
  detail,
  parties,
  shipments,
  ports,
  lanes,
}: {
  detail: EntityDetail;
  parties: Counterpart[];
  shipments: ShipmentRow[];
  ports: EntityRow[];
  lanes: Lane[];
}) {
  const pin = located([detail.row])[0];
  const loading = shipments.filter((s) => s.pol?.id === detail.row.id);
  const discharge = shipments.filter((s) => s.pod?.id === detail.row.id);
  const source = detail.profile?.attributeSources.lat;
  const placedBy = source ? ` · placed by ${BY[source.source] ?? source.source}` : "";
  const map = pin ? around(detail.row.id, ports, lanes) : null;
  return (
    <div className="px-7 py-6">
      {map ? (
        <section className="mb-8">
          <h2 className="mb-2 text-heading font-medium">
            Where it ships <span className="font-mono text-mono-sm text-ink-tertiary">{map.lanes.length} lanes</span>
          </h2>
          <WorldMap pins={map.pins} lanes={map.lanes} focus={detail.row.id} />
          <p className="mt-1 text-caption text-ink-tertiary">
            {detail.row.attributes.lat}, {detail.row.attributes.lon}
            {placedBy}
          </p>
        </section>
      ) : (
        <p className="mb-8 rounded-md border border-hairline bg-sunken px-3 py-2 text-small text-ink-tertiary">
          Not located yet. The world&apos;s port list places a port by the words of its name; this one it does not know.
        </p>
      )}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-8">
        <section>
          <h2 className="mb-2 text-heading font-medium">What it is</h2>
          <ProfileSummary profile={detail.profile} />
        </section>
        <section>
          <h2 className="mb-2 text-heading font-medium">
            Loading here <span className="font-mono text-mono-sm text-ink-tertiary">{loading.length}</span>
          </h2>
          <ShipmentTable rows={loading} empty="Nothing loaded here in the mail read so far." />
        </section>
        <section>
          <h2 className="mb-2 text-heading font-medium">
            Discharging here <span className="font-mono text-mono-sm text-ink-tertiary">{discharge.length}</span>
          </h2>
          <ShipmentTable rows={discharge} empty="Nothing discharged here in the mail read so far." />
        </section>
        <section>
          <h2 className="mb-2 text-heading font-medium">
            Where it appeared <span className="font-mono text-mono-sm text-ink-tertiary">{detail.appearanceCount}</span>
          </h2>
          <AppearanceList appearances={detail.appearances} total={detail.appearanceCount} />
        </section>
      </div>
      <aside className="min-w-0 space-y-6">
        <CounterpartList title="Companies using it" items={parties} empty="No company seen beside it yet." />
        <WrittenTheseWays names={detail.names} />
      </aside>
      </div>
    </div>
  );
}
