import { PageSkeleton, TableSkeleton } from "@/components/shell/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton crumbs={["Senders"]}>
      <TableSkeleton />
    </PageSkeleton>
  );
}
