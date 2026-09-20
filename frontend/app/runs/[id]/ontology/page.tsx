import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Placeholder } from "@/components/shell/placeholder";
import { getObjectGraph, getObjectRecord, listObjectTypes, listRunEmails } from "@/lib/api-client";

import { OntologyPage } from "./ontology-page";

export const dynamic = "force-dynamic";

const RUN_ID = /^[0-9a-f-]{36}$/;

export const metadata: Metadata = { title: "Ontology · Retina SDOC" };

/**
 * Which email the page opens on.
 *
 * The one with the most differing fields, because a record with two
 * differences and eight links says what this page is for, and an email that
 * was sorted SPAM and stopped says almost nothing. Falls back to the first
 * email of the run when nothing has been compared yet.
 */
function opening(emails: { emailId: string; defectFields: string[] }[]): string | null {
  const sorted = [...emails].sort((a, b) => b.defectFields.length - a.defectFields.length);
  return sorted[0]?.emailId ?? null;
}

/** What the model knows as a model: the stored values of a record, and the links out of it. */
export default async function Page({ params, searchParams }: PageProps<"/runs/[id]/ontology">) {
  const { id } = await params;
  if (!RUN_ID.test(id)) notFound();

  const asked = await searchParams;
  const wanted = typeof asked.id === "string" ? asked.id : null;

  const [types, list] = await Promise.all([listObjectTypes(), listRunEmails(id, { pageSize: 200 })]);
  const emailId = wanted ?? opening(list.emails);

  if (!emailId) {
    return (
      <Placeholder
        runId={id}
        active="ontology"
        icon="graph"
        title="Ontology"
        crumbs={["Runs", id.slice(0, 8), "Ontology"]}
        phase="waiting on this run"
        blurb="What the model knows as a model: the stored values of a record, and the links out of it."
        holds={["This run has no emails yet, so there is no record to read. Start it and the ontology fills as it goes."]}
      />
    );
  }

  // Both hop counts up front: the second is a cheap query and fetching it here
  // makes `Two hops` instant, which a control that redraws a frozen canvas
  // ought to be.
  const [record, graph, graphTwoHops] = await Promise.all([
    getObjectRecord("email", emailId, id),
    getObjectGraph(emailId, id, 1),
    getObjectGraph(emailId, id, 2),
  ]);
  if (!record) notFound();

  return <OntologyPage runId={id} types={types} record={record} graph={graph} graphTwoHops={graphTwoHops} />;
}
