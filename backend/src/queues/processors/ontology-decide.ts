import { type LlmClient, type ResolveCandidate, resolveSighting } from "../../agents";
import { loadPrompt } from "../../agents/prompts/registry";
import { config } from "../../config";
import type { EntityKind } from "../../contracts";
import type { Queryable } from "../../db";
import { childLogger } from "../../lib/logger";
import type { LiveCalls } from "../../live";
import { entityInputs, entityLocate, entityProfile, entitySearch, type JoinStep, sightings as sightingsRepo } from "../../ontology/repositories";
import { planSighting, seenAmong } from "../../pipeline/ontology";
import { locatePort } from "../../reference/ports";
import type { EmailRunIds } from "./ids";

const log = childLogger({ module: "ontology.decide" });

const RESOLVE_PROMPT = "v1";
export const CANDIDATES = 8;

export interface ResolveDeps {
  pool: Queryable;
  llm: LlmClient;
  live?: LiveCalls;
}

/**
 * What to do about one spelling. `seen` is what the model was shown, kept so
 * the commit can tell whether the ontology moved before it wrote the answer.
 * A join names its judge: the `entity-resolve` model with its confidence, or
 * the world's port list, which has none.
 */
export type Decision =
  | { action: "use"; entityId: number }
  | { action: "create"; kind: EntityKind; surface: string; seen: string }
  | { action: "join"; kind: EntityKind; entityId: number; surface: string; confidence: number | null; step: JoinStep; seen: string };

export interface Verdict {
  decision: Decision;
  ambiguous: boolean;
  /** Whether a model was asked. Zero across a mailbox that repeats its names, which is the point of storing verdicts. */
  asked: boolean;
}

/** The nearest things with what a model needs to tell them apart: every spelling, where each was seen, what it is. */
async function described(db: Queryable, found: entitySearch.EntityCandidate[]): Promise<ResolveCandidate[]> {
  const candidates: ResolveCandidate[] = [];
  for (const candidate of found) {
    const profile = await entityProfile.read(db, candidate.id);
    candidates.push({
      id: candidate.id,
      kind: candidate.kind,
      canonical: candidate.canonical,
      spellings: [...new Set([candidate.matched, candidate.canonical])],
      addresses: await sightingsRepo.addressesOf(db, candidate.id, 4),
      summary: profile?.markdown?.split("\n")[0] ?? null,
    });
  }
  return candidates;
}

/** One spelling: reuse a stored judgement, or ask for one against what is committed now. */
export async function decideSpelling(
  deps: ResolveDeps,
  ids: EmailRunIds,
  kind: EntityKind,
  role: string,
  surface: string,
  address: string | null,
): Promise<Verdict> {
  const plan = planSighting(kind, surface, await entityInputs.loadNameHits(deps.pool, [surface]));
  if (plan.decision === "use") return { decision: { action: "use", entityId: plan.entityId }, ambiguous: false, asked: false };

  const found = await entitySearch.findCandidates(deps.pool, surface, kind, CANDIDATES);
  const seen = seenAmong(found);

  // A port is unique by its code. A spelling the world's list places at a code
  // some port already holds is that port, without a model call and without a
  // second row for the next pass to fold.
  if (kind === "port") {
    const locode = locatePort(surface)?.locode;
    const holder = locode ? await entityLocate.holderOfLocode(deps.pool, locode) : null;
    if (holder !== null) {
      return { decision: { action: "join", kind, entityId: holder, surface, confidence: null, step: "reference", seen }, ambiguous: false, asked: false };
    }
  }

  // Nothing near it to be the same as, so the answer is null and `ambiguous` is
  // false whatever the model would say: the prompt reserves both for a list.
  if (found.length === 0) return { decision: { action: "create", kind, surface, seen }, ambiguous: false, asked: false };

  const candidates = await described(deps.pool, found);
  const prompt = loadPrompt("entity-resolve", RESOLVE_PROMPT, config.LLM_MODEL_ENTITY_RESOLVE);
  const { value } = await resolveSighting(deps, prompt, { kind, surface, address, role, candidates }, { runId: ids.runId, emailRunId: ids.emailRunId });

  if (value.sameAs === null) return { decision: { action: "create", kind, surface, seen }, ambiguous: value.ambiguous, asked: true };
  // An id the model named must be one it was given: one it invented would
  // attach this spelling to something nobody showed it.
  if (!candidates.some((candidate) => candidate.id === value.sameAs)) {
    log.warn({ ...ids, surface, sameAs: value.sameAs }, "entity-resolve named an id it was not given; treated as new");
    return { decision: { action: "create", kind, surface, seen }, ambiguous: true, asked: true };
  }
  return {
    decision: { action: "join", kind, entityId: Number(value.sameAs), surface, confidence: value.confidence, step: "entity-resolve", seen },
    ambiguous: value.ambiguous,
    asked: true,
  };
}
