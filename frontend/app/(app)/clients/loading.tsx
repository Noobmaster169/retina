import { PageFrame, PageHeading, TableTemplate } from "@/components/shell/page-skeleton";

/** The five columns `clients-table.tsx` really draws. */
const HEADS = [{ label: "Sender" }, { label: "Served" }, { label: "Kind" }, { label: "Emails" }, { label: "Mismatches" }];

export default function Loading() {
  return (
    <PageFrame crumbs={["Senders"]}>
      <PageHeading title="Clients" />
      <TableTemplate columns={HEADS} />
    </PageFrame>
  );
}
