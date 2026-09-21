import type { Metadata } from "next";

import { listEntities, listLanes } from "@/lib/api-client";

import { PortList } from "./port-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ports · Retina SDOC" };

/** Every port the mail named, on the map once located, with every lane between two of them. Global, because a port is not a property of one run. */
export default async function Page() {
  const [list, lanes] = await Promise.all([listEntities("port"), listLanes()]);
  return <PortList rows={list.entities} lanes={lanes} />;
}
