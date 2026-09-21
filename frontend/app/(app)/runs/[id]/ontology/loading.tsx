import { Bar, PageSkeleton } from "@/components/shell/page-skeleton";

export default function Loading() {
  return (
    <PageSkeleton crumbs={["Runs", "Ontology"]}>
      <div className="py-5">
        <Bar className="h-[520px] w-full rounded-xl" />
      </div>
    </PageSkeleton>
  );
}
