import { Bar, PageSkeleton } from "@/components/shell/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton crumbs={["Runs", "Results"]}>
      <div className="space-y-3 py-5">
        <Bar className="h-7 w-56" />
        <Bar className="h-28 w-full rounded-xl" />
        <Bar className="h-64 w-full rounded-xl" />
      </div>
    </PageSkeleton>
  );
}
