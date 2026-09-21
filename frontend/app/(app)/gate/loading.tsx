import { Bar, PageFrame, PageHeading } from "@/components/shell/page-skeleton";

export default function Loading() {
  return (
    <PageFrame crumbs={["Traffic"]}>
      <PageHeading title="Traffic" />
      <div className="space-y-3">
        <Bar className="h-24 w-full rounded-xl" />
        <Bar className="h-64 w-full rounded-xl" />
      </div>
    </PageFrame>
  );
}
