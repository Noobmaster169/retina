import { type LlmClient, type ResolveCandidate, resolveSighting } from "../../agents";
import { loadPrompt } from "../../agents/prompts/registry";
import { config } from "../../config";
import type { EntityKind } from "../../contracts";
import type { Queryable } from "../../db";
import { childLogger } from "../../lib/logger";
import type { LiveCalls } from "../../live";
import { entityInputs, entityProfile, entitySearch, sightings as sightingsRepo } from "../../ontology/repositories";
import { type AssembledShipment, kindOfRole, planSighting, type ShipmentColumn, type SightingRole } from "../../pipeline/ontology";
import type { EmailRunIds } from "./ids";

const log = childLogger({ module: "ontology.resolve" });

const RESOLVE_PROMPT = "v1";
const CANDIDATES = 8;

/**
 * Every spelling one email produced, decided but not yet written.
 *
 * A spelling one live thing already holds costs nothing: that is a judgement
 * some model already made and stored. Everything else goes to
 * `entity-resolve`, which answers an id or null, and null means a thing that
 * did not exist yet.
 *
 * It plans rather than writes, so the whole reading of one email lands in one
 * transaction. A half-written reading, with three of five things created and a
 * shipment nobody wrote, is the shape a retry cannot tell from a finished one.
 */

export interface ResolveDeps {
  pool: Queryable;
  llm: LlmClient;
  live?: LiveCalls;
}

/** What to do about one spelling. The writer turns each of these into an id. */
export type Decision =
  | { action: "use"; entityId: number }
  | { action: "create"; kind: EntityKind; surface: string }
  | { action: "join"; entityId: number; surface: string; confidence: number };

export interface PlannedSighting {
  /** The key into `decisions`. The writer swaps it for an id. */
  thing: string;
  role: SightingRole;
  source: "subject" | "body" | "header" | "document";
  surface: string;
  address: string | null;
  sourceQuote: string;
  ambiguous: boolean;
}

export interface ResolvedOntology {
  decisions: Map<string, Decision>;
  sightings: PlannedSighting[];
  links: Partial<Record<ShipmentColumn, string>>;
  /** How many spellings needed a model call. Zero in steady state, which is the point. */
  judged: number;
}

async function candidatesFor(deps: ResolveDeps, kind: EntityKind, surface: string): Promise<ResolveCandidate[]> {
  const found = await entitySearch.findCandidates(deps.pool, surface, kind, CANDIDATES);
  const candidates: ResolveCandidate[] = [];
  for (const candidate of found) {
    const profile = await entityProfile.read(deps.pool, candidate.id);
    const addresses = await sightingsRepo.addressesOf(deps.pool, candidate.id, 4);
    candidates.push({
      id: candidate.id,
      kind: candidate.kind,
      canonical: candidate.canonical,
      spellings: [...new Set([candidate.matched, candidate.canonical])],
      addresses,
      summary: profile?.markdown?.split("\n")[0] ?? null,
    });
  }
  return candidates;
}

interface Verdict {
  decision: Decision;
  ambiguous: boolean;
}

/** One spelling: reuse a stored judgement, or ask for one. */
async function decide(
  deps: ResolveDeps,
  ids: EmailRunIds,
  kind: EntityKind,
  role: string,
  surface: string,
  address: string | null,
  counted: { judged: number },
): Promise<Verdict> {
  const hits = await entityInputs.loadNameHits(deps.pool, [surface]);
  const plan = planSighting(kind, surface, hits);
  if (plan.decision === "use") return { decision: { action: "use", entityId: plan.entityId }, ambiguous: false };

  const candidates = await candidatesFor(deps, kind, surface);
  const prompt = loadPrompt("entity-resolve", RESOLVE_PROMPT, config.LLM_MODEL_ENTITY_RESOLVE);
  const { value } = await resolveSighting(deps, prompt, { kind, surface, address, role, candidates }, { runId: ids.runId, emailRunId: ids.emailRunId });
  counted.judged += 1;

  if (value.sameAs === null) return { decision: { action: "create", kind, surface }, ambiguous: value.ambiguous };
  // An id the model named must be one it was given: one it invented would
  // attach this spelling to something nobody showed it.
  if (!candidates.some((candidate) => candidate.id === value.sameAs)) {
    log.warn({ ...ids, surface, sameAs: value.sameAs }, "entity-resolve named an id it was not given; treated as new");
    return { decision: { action: "create", kind, surface }, ambiguous: true };
  }
  return { decision: { action: "join", entityId: Number(value.sameAs), surface, confidence: value.confidence }, ambiguous: value.ambiguous };
}

/** Which kind each shipment column holds. The columns are named for their role, not their kind. */
const KIND_OF_COLUMN: Record<ShipmentColumn, EntityKind> = {
  shipper_id: "party",
  consignee_id: "party",
  notify_party_id: "party",
  pol_id: "port",
  pod_id: "port",
  carrier_id: "carrier",
  vessel_id: "vessel",
  commodity_id: "commodity",
};

export async function resolveSightings(deps: ResolveDeps, ids: EmailRunIds, assembled: AssembledShipment): Promise<ResolvedOntology> {
  const counted = { judged: 0 };
  const decisions = new Map<string, Decision>();
  const ambiguous = new Map<string, boolean>();

  /** One spelling of one kind is decided once per email, however many roles it plays. */
  async function thing(kind: EntityKind, role: string, surface: string, address: string | null): Promise<string> {
    const key = `${kind} ${surface}`;
    if (decisions.has(key)) return key;
    const verdict = await decide(deps, ids, kind, role, surface, address, counted);
    decisions.set(key, verdict.decision);
    ambiguous.set(key, verdict.ambiguous);
    return key;
  }

  const planned: PlannedSighting[] = [];
  for (const sighting of assembled.sightings) {
    const key = await thing(kindOfRole(sighting.role), sighting.role, sighting.surface, sighting.address);
    planned.push({
      thing: key,
      role: sighting.role,
      source: sighting.source,
      surface: sighting.surface,
      address: sighting.address,
      sourceQuote: sighting.sourceQuote,
      ambiguous: ambiguous.get(key) ?? false,
    });
  }

  const links: Partial<Record<ShipmentColumn, string>> = {};
  for (const link of assembled.shipment.links) {
    links[link.column] = await thing(KIND_OF_COLUMN[link.column], link.column, link.surface, null);
  }

  return { decisions, sightings: planned, links, judged: counted.judged };
}
