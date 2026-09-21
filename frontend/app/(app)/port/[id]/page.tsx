import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DetailHeader } from "@/components/business/detail-header";
import { EditThing } from "@/components/business/edit-thing";
import { SameAs } from "@/components/business/same-as";
import { PageContext } from "@/components/dock/page-context-announcer";
import { TopBar } from "@/components/shell/top-bar";
import { getEntityDetail, listCounterparts, listShipments } from "@/lib/api-client";

import { PortSections } from "./port-sections";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Port · Retina SDOC" };

const ID = /^\d+$/;

export default async function Page({ params }: PageProps<"/port/[id]">) {
  const { id } = await params;
  if (!ID.test(id)) notFound();
  const detail = await getEntityDetail("port", id);
  if (!detail) notFound();
  const [parties, shipments] = await Promise.all([listCounterparts("port", id, "parties"), listShipments({ portId: id, pageSize: 100 })]);
  const a = detail.row.attributes;
  const chips = [a.locode, a.country, a.subregion ?? a.region, a.coast].filter((value): value is string => !!value);

  return (
    <div className="flex min-w-0 grow flex-col">
      <PageContext
        refs={[{ kind: "port", id, title: detail.row.name }]}
        suggestions={["Which companies ship through this port?", "What discharged here in the last month?"]}
      />
      <TopBar crumbs={[{ label: "Ports", href: "/port" }, { label: detail.row.name }]} />
      <main className="min-h-0 grow overflow-y-auto">
        <DetailHeader
          type="port"
          name={detail.row.name}
          chips={chips}
          countryCode={detail.row.attributes.countryCode}
          aside={
            <div className="flex shrink-0 gap-2">
              <EditThing kind="port" id={id} name={detail.row.name} attributes={detail.row.attributes} />
              <SameAs kind="port" id={id} name={detail.row.name} />
            </div>
          }
        />
        <PortSections detail={detail} parties={parties} shipments={shipments.shipments} />
      </main>
    </div>
  );
}
