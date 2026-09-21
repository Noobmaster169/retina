import { Bar, PageFrame, PageHeading } from "@/components/shell/page-skeleton";

export default function Loading() {
  return (
    <PageFrame crumbs={["Runs", "Ontology"]}>
      <PageHeading title="Ontology" />
      <Bar className="h-[520px] w-full rounded-xl" />
    </PageFrame>
  );
}
