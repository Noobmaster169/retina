import { PageFrame, PageHeading, TableTemplate } from "@/components/shell/page-skeleton";

const HEADS = [{ label: "Run" }, { label: "Started" }, { label: "Emails" }, { label: "Stage" }, { label: "Score" }];

export default function Loading() {
  return (
    <PageFrame crumbs={["Runs"]}>
      <PageHeading title="Runs" />
      <TableTemplate columns={HEADS} rows={8} />
    </PageFrame>
  );
}
