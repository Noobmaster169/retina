import { Bar, PageSkeleton } from "@/components/shell/page-skeleton";

/** The conversation's own shape: a question to the right, an answer under it. */
export default function Loading() {
  return (
    <PageSkeleton crumbs={["Runs", "Ask Retina"]}>
      <div className="max-w-[72ch] space-y-6 py-5">
        <div className="flex justify-end">
          <Bar className="h-9 w-64 rounded-lg" />
        </div>
        <div className="space-y-2.5">
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-5/6" />
          <Bar className="h-4 w-2/3" />
        </div>
      </div>
    </PageSkeleton>
  );
}
