import { permanentRedirect } from "next/navigation";

/**
 * A resolved thing's record moved to the ontology's Record tab.
 *
 * Kept as a redirect rather than deleted: this URL was the one `Open the full
 * record` pointed at, and two pages rendering the same record is how the two
 * drift. The ontology is where a thing is read now; the database page below it
 * is hidden and still serves the rows.
 */
export default async function Page({ params }: PageProps<"/runs/[id]/database/[type]/[entityId]">) {
  const { id, type, entityId } = await params;
  permanentRedirect(`/runs/${id}/ontology?type=${type}&id=${encodeURIComponent(entityId)}&tab=record`);
}
