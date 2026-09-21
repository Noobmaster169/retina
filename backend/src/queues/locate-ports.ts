import { locatePort } from "../agents";
import type { Prompt } from "../agents/prompts/registry";
import type { StructuredDeps } from "../agents/structured";
import { LOCATED_KEYS } from "../contracts";
import { childLogger } from "../lib/logger";
import { entities, entityProfile } from "../ontology/repositories";

const log = childLogger({ module: "locate-ports" });

/**
 * One port, once. Runs from the profile pass after a port's profile is
 * written, and only while its coordinates are null, so a located port never
 * costs another search and an unplaced one is asked again on its next refresh.
 */

export type LocateOutcome = "located" | "unplaced" | "kept";

export async function locatePortIfNeeded(deps: StructuredDeps, prompt: Prompt, entityId: string): Promise<LocateOutcome> {
  const [row, stored] = await Promise.all([entities.find(deps.pool, entityId), entityProfile.read(deps.pool, entityId)]);
  if (!row || row.type !== "port") return "kept";
  const attributes = stored?.attributes ?? {};
  if (LOCATED_KEYS.every((key) => attributes[key] != null)) return "kept";

  const { value } = await locatePort(deps, prompt, {
    canonical: row.name,
    country: attributes.country ?? null,
    locode: attributes.locode ?? null,
  });
  if (value.lat === null || value.lon === null) {
    log.info({ entityId, port: row.name }, "the model could not place this port");
    return "unplaced";
  }
  const source = { source: value.basis, confidence: value.confidence, llmCallId: null };
  await entityProfile.mergeAttributes(
    deps.pool,
    entityId,
    { lat: String(value.lat), lon: String(value.lon) },
    { lat: source, lon: source },
  );
  log.info({ entityId, port: row.name, basis: value.basis, url: value.url }, "located a port");
  return "located";
}
