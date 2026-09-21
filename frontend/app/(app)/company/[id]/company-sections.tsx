import Link from "next/link";

import { CounterpartList } from "@/components/business/counterpart-list";
import { ProfileSummary } from "@/components/business/profile-summary";
import { ShipmentTable } from "@/components/business/shipment-table";
import { AppearanceList } from "@/components/database/appearance-list";
import { WrittenTheseWays } from "@/components/database/written-these-ways";
import type { Counterpart, EntityDetail } from "@/lib/api/ontology-schemas";
import type { ShipmentRow } from "@/lib/api/shipments-schemas";

/** The body of a company page: what it is, what it ships, who is on its mail, where it has been seen. */
export function CompanySections({
  detail,
  people,
  ports,
  shipments,
}: {
  detail: EntityDetail;
  people: Counterpart[];
  ports: Counterpart[];
  shipments: ShipmentRow[];
}) {
  const roles = Object.entries(detail.row.roles).sort((a, b) => b[1] - a[1]);
  const latest = detail.appearances[0];
  return (
    <div className="grid grid-cols-1 gap-8 px-7 py-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-8">
        <section>
          <h2 className="mb-2 text-heading font-medium">What it is</h2>
          <ProfileSummary profile={detail.profile} />
        </section>
        <section>
          <h2 className="mb-2 text-heading font-medium">
            Shipments <span className="font-mono text-mono-sm text-ink-tertiary">{shipments.length}</span>
          </h2>
          <ShipmentTable rows={shipments} empty="No shipment names this company yet." />
        </section>
        <section>
          <h2 className="mb-2 text-heading font-medium">
            Where it appeared <span className="font-mono text-mono-sm text-ink-tertiary">{detail.appearanceCount}</span>
          </h2>
          <AppearanceList appearances={detail.appearances} total={detail.appearanceCount} />
        </section>
      </div>
      <aside className="min-w-0 space-y-6">
        <section>
          <h3 className="text-caption font-medium text-ink-tertiary">Roles</h3>
          <ul className="mt-1">
            {roles.map(([role, n]) => (
              <li key={role} className="flex h-8 items-center border-b border-hairline-faint text-small">
                <span className="grow text-ink-secondary">{role.replace(/_/g, " ")}</span>
                <span className="font-mono text-mono-sm text-ink">{n} emails</span>
              </li>
            ))}
          </ul>
        </section>
        <CounterpartList title="Ports it ships through" items={ports} empty="No port seen beside it yet." />
        <CounterpartList title="People on its mail" items={people} empty="No person read from its mail yet." />
        <WrittenTheseWays names={detail.names} />
        {latest ? (
          <Link
            href={`/runs/${latest.runId}/ontology?type=email&id=${encodeURIComponent(latest.emailId)}&tab=links`}
            className="inline-flex h-8 items-center rounded-md border border-hairline-strong px-3 text-small text-ink-secondary hover:border-ink-faint"
          >
            Open its latest email&rsquo;s graph
          </Link>
        ) : null}
      </aside>
    </div>
  );
}
