import type { EntityKind } from "../../contracts";
import { TerminalError } from "../../lib/errors";
import { inParallel } from "../../lib/parallel";
import { type AssembledShipment, kindOfRole, type ShipmentColumn, type SightingRole } from "../../pipeline/ontology";
import type { EmailRunIds } from "./ids";
import { type Decision, decideSpelling, type ResolveDeps } from "./ontology-decide";

export type { Decision, ResolveDeps } from "./ontology-decide";

/**
 * Every spelling one email produced, decided but not yet written.
 *
 * A spelling one live thing already holds costs nothing: that is a judgement
 * some model already made and stored. A spelling with nothing near it is new
 * without asking. Everything else goes to `entity-resolve`, which answers an id
 * or null.
 *
 * It plans rather than writes, so the whole reading of one email lands in one
 * transaction. A half-written reading, with three of five things created and a
 * shipment nobody wrote, is the shape a retry cannot tell from a finished one.
 */

/**
 * How many of one email's spellings are decided at once. Each decision reads
 * only what was committed when it began and writes nothing, so the order they
 * finish in changes no answer; the writer still creates things in the order the
 * reading names them, whatever the order they were judged in.
 */
const FAN_OUT = 4;

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
  ambiguous: Map<string, boolean>;
  sightings: PlannedSighting[];
  links: Partial<Record<ShipmentColumn, string>>;
  /** How many spellings needed a model call. Zero in steady state, which is the point. */
  judged: number;
}

/** What an earlier round settled and is still standing, so a later one decides only the rest. */
export type Kept = Pick<ResolvedOntology, "decisions" | "ambiguous">;

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

interface Wanted {
  key: string;
  kind: EntityKind;
  role: string;
  surface: string;
  address: string | null;
}

export async function resolveSightings(deps: ResolveDeps, ids: EmailRunIds, assembled: AssembledShipment, kept?: Kept): Promise<ResolvedOntology> {
  // One spelling of one kind is decided once per email, however many roles it plays.
  const wanted = new Map<string, Wanted>();
  const want = (kind: EntityKind, role: string, surface: string, address: string | null): string => {
    const key = `${kind} ${surface}`;
    if (!wanted.has(key)) wanted.set(key, { key, kind, role, surface, address });
    return key;
  };
  const sightingKeys = assembled.sightings.map((sighting) => want(kindOfRole(sighting.role), sighting.role, sighting.surface, sighting.address));
  const linkKeys = assembled.shipment.links.map((link) => [link.column, want(KIND_OF_COLUMN[link.column], link.column, link.surface, null)] as const);

  const todo = [...wanted.values()].filter((one) => !kept?.decisions.has(one.key));
  const asked = await inParallel(todo, FAN_OUT, (one) => decideSpelling(deps, ids, one.kind, one.role, one.surface, one.address));
  const fresh = new Map(todo.map((one, index) => [one.key, asked[index]]));

  const decisions = new Map<string, Decision>();
  const ambiguous = new Map<string, boolean>();
  for (const key of wanted.keys()) {
    const verdict = fresh.get(key);
    const decision = verdict?.decision ?? kept?.decisions.get(key);
    if (!decision) throw new TerminalError(`no decision was made for ${key}`);
    decisions.set(key, decision);
    ambiguous.set(key, verdict?.ambiguous ?? kept?.ambiguous.get(key) ?? false);
  }

  const planned: PlannedSighting[] = assembled.sightings.map((sighting, index) => ({
    thing: sightingKeys[index],
    role: sighting.role,
    source: sighting.source,
    surface: sighting.surface,
    address: sighting.address,
    sourceQuote: sighting.sourceQuote,
    ambiguous: ambiguous.get(sightingKeys[index]) ?? false,
  }));
  const links: Partial<Record<ShipmentColumn, string>> = Object.fromEntries(linkKeys);

  return { decisions, ambiguous, sightings: planned, links, judged: asked.filter((verdict) => verdict.asked).length };
}
