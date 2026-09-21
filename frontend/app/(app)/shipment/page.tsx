import type { Metadata } from "next";

import { listShipments } from "@/lib/api-client";

import { ShipmentList } from "./shipment-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shipments · Retina SDOC" };

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Filtered by the backend, since a shipment list can outgrow one page: party, port, disputed and a reference prefix are all in the URL. */
export default async function Page({ searchParams }: PageProps<"/shipment">) {
  const asked = await searchParams;
  const disputed = one(asked.disputed);
  const list = await listShipments({
    q: one(asked.q),
    partyId: one(asked.partyId),
    portId: one(asked.portId),
    disputed: disputed === "true" || disputed === "false" ? disputed : undefined,
    pageSize: 200,
  });
  return <ShipmentList rows={list.shipments} total={list.total} />;
}
