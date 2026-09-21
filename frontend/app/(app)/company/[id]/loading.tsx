import { DetailSkeleton, PageSkeleton } from "@/components/shell/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton crumbs={["Companies"]}>
      <DetailSkeleton />
    </PageSkeleton>
  );
}
