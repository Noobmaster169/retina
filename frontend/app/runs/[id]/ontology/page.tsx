import type { Metadata } from "next";

import { Placeholder } from "@/components/shell/placeholder";

export const metadata: Metadata = { title: "Ontology · Retina SDOC" };

export default async function OntologyPage({ params }: PageProps<"/runs/[id]/ontology">) {
  const { id } = await params;
  return (
    <Placeholder
      runId={id}
      active="ontology"
      icon="graph"
      title="Ontology"
      crumbs={["Runs", id.slice(0, 8), "Ontology"]}
      phase="phase 10"
      blurb="What the model knows as a model: the stored values of a record, and the links out of it."
      holds={[
        "The Record tab: every stored value with its type and who wrote it, the source, a model or code.",
        "The Links tab: one hop out, laid out once and frozen, with every link named on it.",
        "Step to, which walks a whole link type at once.",
      ]}
    />
  );
}
