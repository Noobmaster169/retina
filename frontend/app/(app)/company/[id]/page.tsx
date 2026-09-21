import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DetailHeader } from "@/components/business/detail-header";
import { PageContext } from "@/components/dock/page-context-announcer";
import { TopBar } from "@/components/shell/top-bar";
import { getEntityDetail, listCounterparts, listShipments } from "@/lib/api-client";

import { CompanySections } from "./company-sections";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Company · Retina SDOC" };

const ID = /^\d+$/;

export default async function Page({ params }: PageProps<"/company/[id]">) {
  const { id } = await params;
  if (!ID.test(id)) notFound();
  const detail = await getEntityDetail("party", id);
  if (!detail) notFound();
  const [people, ports, shipments] = await Promise.all([
    listCounterparts("party", id, "people"),
    listCounterparts("party", id, "ports"),
    listShipments({ partyId: id, pageSize: 100 }),
  ]);
  const a = detail.row.attributes;
  const chips = [a.kind, [a.city, a.country].filter(Boolean).join(", "), a.sector, a.group ? `part of ${a.group}` : null].filter(
    (value): value is string => !!value,
  );

  return (
    <div className="flex min-w-0 grow flex-col">
      <PageContext
        refs={[{ kind: "party", id, title: detail.row.name }]}
        suggestions={["What does this company ship, and to whom?", "Has any of its shipments had a disputed field?"]}
      />
      <TopBar crumbs={[{ label: "Companies", href: "/company" }, { label: detail.row.name }]} />
      <main className="min-h-0 grow overflow-y-auto">
        <DetailHeader type="party" name={detail.row.name} chips={chips} />
        <CompanySections detail={detail} people={people} ports={ports} shipments={shipments.shipments} />
      </main>
    </div>
  );
}
