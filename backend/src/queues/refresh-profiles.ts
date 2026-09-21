import type { Pool } from "pg";

import { type LlmClient, type ProfileOutput, writeProfile } from "../agents";
import { loadPrompt } from "../agents/prompts/registry";
import { type Config, config } from "../config";
import { childLogger } from "../lib/logger";
import { entityDossier, entityProfile, type ProfileWrite } from "../ontology/repositories";
import { renderProfile, type RenderedProfile } from "../pipeline/ontology";
import { locatePortIfNeeded } from "./locate-ports";

const log = childLogger({ module: "refresh-profiles" });

const PROFILE_PROMPT = "v1";
const LOCATE_PROMPT = "v1";

/**
 * Rewrites the profiles of the things this round of mail touched.
 *
 * On a clock rather than on an email, because a profile describes a thing and
 * not a message: one email can touch six things and six emails can touch one,
 * and rewriting per email would do the same work six times. The cost follows
 * the day's new mail and not the size of the table: a thing nobody wrote about
 * is never rewritten.
 *
 * A person never gets a `general` section. What a model believes about a named
 * individual is not something this system stores, whatever
 * `ONTOLOGY_KNOWLEDGE` says.
 */
export function generalAllowed(kind: string, knowledge: Config["ONTOLOGY_KNOWLEDGE"] = config.ONTOLOGY_KNOWLEDGE): boolean {
  return knowledge === "mail+model" && kind !== "person";
}

export interface RefreshProfilesDeps {
  pool: Pool;
  llm: LlmClient;
}

export async function refreshProfiles(deps: RefreshProfilesDeps): Promise<number> {
  const ids = await entityProfile.staleIds(deps.pool, config.PROFILE_BATCH, config.PROFILE_FLOOR_HOURS);
  if (ids.length === 0) return 0;

  const prompt = loadPrompt("entity-profile", PROFILE_PROMPT, config.LLM_MODEL_ENTITY_PROFILE);
  const locate = loadPrompt("port-locate", LOCATE_PROMPT, config.LLM_MODEL_PORT_LOCATE);
  const until = Date.now() + config.MAINTENANCE_BUDGET_MS;
  let written = 0;
  for (const id of ids) {
    // The batch is an upper bound and the clock is the real one: the rest of
    // it is still stale and the next tick takes it, while an email waiting for
    // its reading does not wait half an hour behind this.
    if (Date.now() > until) {
      log.info({ written, left: ids.length - written }, "the profile pass ran out of time; the next tick continues it");
      break;
    }
    const dossier = await entityDossier.loadDossier(deps.pool, id);
    // Merged or dropped between the list and here. Nothing to describe.
    if (!dossier) continue;
    try {
      const { value } = await writeProfile(deps, prompt, { dossier, allowGeneral: generalAllowed(dossier.kind) });
      const rendered = renderProfile(dossier.kind, dossier.canonical, dossier.spellings, value, value.attributes);
      await entityProfile.write(deps.pool, id, profileWrite(rendered, value));
      written += 1;
      // A search is the same failure class as a profile: logged below, never the tick.
      if (dossier.kind === "port") await locatePortIfNeeded(deps, locate, id);
    } catch (error) {
      // One thing's profile is never worth failing the tick over: the next one
      // picks it up, and every other thing in this batch still gets written.
      log.warn({ entityId: id, err: error instanceof Error ? error.message : String(error) }, "could not write a profile");
    }
  }
  log.info({ asked: ids.length, written }, "rewrote the profiles of what the mail touched");
  return written;
}

/**
 * Where each attribute came from, key for key.
 *
 * Per key rather than per profile, because the two bases answer different
 * keys: a city comes off an address in our mail, a region appears in no email
 * at all and is the model's. The model says which; a key it filled and did not
 * account for is treated as its own knowledge, which is the cautious reading.
 */
function profileWrite(rendered: RenderedProfile, value: ProfileOutput): ProfileWrite {
  const sources: ProfileWrite["attributeSources"] = {};
  for (const [key, attribute] of Object.entries(value.attributes)) {
    if (attribute === null || attribute === "") continue;
    const source = value.attributeBasis[key] === "mail" ? "mail" : "model";
    sources[key] = { source, confidence: source === "mail" ? null : value.generalConfidence, llmCallId: null };
  }
  return { markdown: rendered.markdown, searchText: rendered.searchText, attributes: value.attributes, attributeSources: sources };
}
