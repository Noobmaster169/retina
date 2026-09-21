import { CounterpartList } from "@/components/business/counterpart-list";
import { located } from "@/components/business/map-scale";
import { ProfileSummary } from "@/components/business/profile-summary";
import { ShipmentTable } from "@/components/business/shipment-table";
import { WorldMap } from "@/components/business/world-map";
import { AppearanceList } from "@/components/database/appearance-list";
import { WrittenTheseWays } from "@/components/database/written-these-ways";
import type { Counterpart, EntityDetail } from "@/lib/api/ontology-schemas";
import type { ShipmentRow } from "@/lib/api/shipments-schemas";

/** The body of a port page: what it is, what loads and discharges there, who uses it, where it was seen. */
export function PortSections({ detail, parties, shipments }: { detail: EntityDetail; parties: Counterpart[]; shipments: ShipmentRow[] }) {
  const pin = located([detail.row])[0];
  const loading = shipments.filter((s) => s.pol?.id === detail.row.id);
  const discharge = shipments.filter((s) => s.pod?.id === detail.row.id);
  const source = detail.profile?.attributeSources.lat;
  const by: Record<string, string> = { reference: "the world's port list", human: "a person", model: "the model", mail: "the mail" };
  const placedBy = source ? ` · placed by ${by[source.source] ?? source.source}` : "";
  return (
    <div className="grid grid-cols-1 gap-8 px-7 py-6 xl:grid-cols-[minmax(0,1fr)_380px]">
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
        {pin ? (
          <div>
            <WorldMap
              pins={[
                {
                  id: detail.row.id,
                  name: detail.row.name,
                  lat: pin.lat,
                  lon: pin.lon,
                  count: 1,
                  href: "#",
                  loading: loading.length,
                  discharge: discharge.length,
                },
              ]}
              focus={detail.row.id}
            />
            <p className="mt-1 text-caption text-ink-tertiary">
              {detail.row.attributes.lat}, {detail.row.attributes.lon}
              {placedBy}
            </p>
          </div>
        ) : (
          <p className="rounded-md border border-hairline bg-sunken px-3 py-2 text-small text-ink-tertiary">
            Not located yet. The locate step places a port once its profile is written.
          </p>
        )}
        <CounterpartList title="Companies using it" items={parties} empty="No company seen beside it yet." />
        <WrittenTheseWays names={detail.names} />
      </aside>
    </div>
  );
}
