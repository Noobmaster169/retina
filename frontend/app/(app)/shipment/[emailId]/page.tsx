import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DetailHeader } from "@/components/business/detail-header";
import { PageContext } from "@/components/dock/page-context-announcer";
import { TopBar } from "@/components/shell/top-bar";
import { getShipment } from "@/lib/api-client";

import { ShipmentRecord } from "./shipment-record";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shipment · Retina SDOC" };

export default async function Page({ params }: PageProps<"/shipment/[emailId]">) {
  const { emailId } = await params;
  const shipment = await getShipment(emailId);
  if (!shipment) notFound();
  const reference = shipment.ocNo ?? shipment.blNo ?? shipment.bookingRef ?? emailId;
  const chips = [
    shipment.ocNo ? `OC ${shipment.ocNo}` : null,
    shipment.blNo ? `BL ${shipment.blNo}` : null,
    shipment.bookingRef ? `booking ${shipment.bookingRef}` : null,
    shipment.mailDate ? `mail dated ${shipment.mailDate}` : null,
  ].filter((value): value is string => !!value);
  const refs = [
    { kind: "shipment" as const, id: emailId, title: `shipment ${reference}` },
    ...(shipment.runId ? [{ kind: "run" as const, id: shipment.runId, title: `run ${shipment.runId.slice(0, 8)}` }] : []),
  ];

  return (
    <div className="flex min-w-0 grow flex-col">
      <PageContext
        refs={refs}
        suggestions={["Which fields disagreed on this shipment, and which side was right?", "Has this consignee shipped on this lane before?"]}
      />
      <TopBar crumbs={[{ label: "Shipments", href: "/shipment" }, { label: reference, mono: true }]} />
      <main className="min-h-0 grow overflow-y-auto">
        <DetailHeader type="shipment" name={reference} chips={chips} />
        <ShipmentRecord shipment={shipment} />
      </main>
    </div>
  );
}
