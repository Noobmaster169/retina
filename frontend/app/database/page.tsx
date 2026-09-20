import type { Metadata } from "next";

import { Placeholder } from "@/components/shell/placeholder";

export const metadata: Metadata = { title: "Database · Retina SDOC" };

export default function DatabasePage() {
  return (
    <Placeholder
      active="database"
      icon="table"
      title="Database"
      crumbs={["Database"]}
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
