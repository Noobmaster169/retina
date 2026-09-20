import type { Metadata } from "next";

import { Placeholder } from "@/components/shell/placeholder";

export const metadata: Metadata = { title: "Database · Retina SDOC" };

export default async function DatabasePage({ params }: PageProps<"/runs/[id]/database">) {
  const { id } = await params;
  return (
    <Placeholder
      runId={id}
      active="database"
      icon="table"
      title="Database"
      crumbs={["Runs", id.slice(0, 8), "Database"]}
      phase="phase 10"
      blurb="The same data two ways: as the rows the schema stores, and as the things the model reads them as."
      holds={[
        "Every table with typed column headers, and the SQL that produced the page along its foot.",
        "The same data as records, including the four that are planned and not in the schema yet.",
        "One record as a page: every spelling the judge accepted as it, and every time it appeared.",
      ]}
    />
  );
}
