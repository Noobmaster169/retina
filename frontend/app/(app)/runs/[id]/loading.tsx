import { Bar, PageFrame } from "@/components/shell/page-skeleton";

/** The overview: the run's title, its tiles, then the panels under them. */
export default function Loading() {
  return (
    <PageFrame crumbs={["Runs", "Overview"]}>
      <div className="py-5">
        <Bar className="h-8 w-80" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {Array.from({ length: 6 }, (_, at) => (
          <Bar key={at} className="h-24 rounded-xl" />
        ))}
      </div>
      <Bar className="mt-3 h-64 w-full rounded-xl" />
    </PageFrame>
  );
}
