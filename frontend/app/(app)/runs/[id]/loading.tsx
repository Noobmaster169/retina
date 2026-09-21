import { Bar, PageSkeleton } from "@/components/shell/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton crumbs={["Runs", "Overview"]}>
      <div className="space-y-3 py-5">
        <Bar className="h-7 w-72" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {Array.from({ length: 6 }, (_, at) => (
            <Bar key={at} className="h-24 rounded-xl" />
          ))}
        </div>
        <Bar className="h-64 w-full rounded-xl" />
      </div>
    </PageSkeleton>
  );
}
