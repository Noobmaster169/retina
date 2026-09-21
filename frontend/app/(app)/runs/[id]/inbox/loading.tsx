import { PageSkeleton, TableSkeleton } from "@/components/shell/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton crumbs={["Runs", "Inbox"]}>
      <TableSkeleton rows={16} />
    </PageSkeleton>
  );
}
