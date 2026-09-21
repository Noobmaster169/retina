import type { Metadata } from "next";

import { listEntities } from "@/lib/api-client";

import { CompanyList } from "./company-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Companies · Retina SDOC" };

/** Every company the mail resolved: shippers, consignees, notify parties. Global, because a company is not a property of one run. */
export default async function Page() {
  const list = await listEntities("party");
  return <CompanyList rows={list.entities} />;
}
