import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DetailHeader } from "@/components/business/detail-header";
import { PageContext } from "@/components/dock/page-context-announcer";
import { TopBar } from "@/components/shell/top-bar";
import { located } from "@/components/business/map-scale";
import { getShipment, listEntities } from "@/lib/api-client";
import type { ShipmentRef } from "@/lib/api/shipments-schemas";

import { ShipmentRecord } from "./shipment-record";
import { type RoutePort, ShipmentRoute } from "./shipment-route";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shipment · Retina SDOC" };

export default async function Page({ params }: PageProps<"/shipment/[emailId]">) {
  const { emailId } = await params;
  const shipment = await getShipment(emailId);
  if (!shipment) notFound();
  // The port list carries where each port sits; a shipment names its ports only by id.
  const ports = shipment.pol || shipment.pod ? (await listEntities("port")).entities : [];
  const routePort = (ref: ShipmentRef | null): RoutePort | null => {
    if (!ref) return null;
    const row = ports.find((port) => port.id === ref.id);
    const at = row ? located([row])[0] : undefined;
    return { ref, lat: at?.lat ?? null, lon: at?.lon ?? null };
  };
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
        <ShipmentRecord shipment={shipment} route={<ShipmentRoute pol={routePort(shipment.pol)} pod={routePort(shipment.pod)} />} />
      </main>
    </div>
  );
}
