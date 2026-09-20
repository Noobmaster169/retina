import type { EntityKind } from "../../contracts";
import type { ResolvedEntity } from "./resolve";

/**
 * Which id each resolved cluster should keep.
 *
 * The resolver rebuilds every cluster from scratch on each pass, and until now
 * the writer deleted every row and reinserted, so every id changed. That was
 * fine while an id meant nothing. It stops being fine the moment a profile, a
 * concept verdict or a shipment column hangs on one: all three would be
 * pointing at a row that describes something else by the next refresh.
 *
 * So the pass now plans instead of replacing. A cluster that the last pass
 * also produced finds the entity that already holds its spellings and keeps
 * that id; a cluster that did not exist is inserted; two entities that a new
 * verdict has joined become one, with a tombstone on the loser so a stored
 * verdict can follow it.
 *
 * Pure. No database, no clock, no io.
 */

/** One entity as the database currently holds it. Only what the plan needs to decide. */
export interface ExistingEntity {
  id: number;
  kind: EntityKind;
  /** How much evidence it holds. The survivor of a merge is the one with more, because its profile describes more. */
  mentionCount: number;
  /** Every spelling it currently holds. */
  names: { value: string; seenCount: number }[];
}

export interface ReconcilePlan {
  /** Clusters that found the id already holding their spellings. */
  keep: { id: number; cluster: ResolvedEntity }[];
  /** Clusters nothing in the database holds yet. */
  insert: ResolvedEntity[];
  /** `from` is tombstoned, its row kept, and everything hanging on it repointed at `into`. */
  merge: { from: number; into: number }[];
  /** Entities no cluster claims any more: every spelling they held is gone from the data. */
  drop: number[];
}

function keyOf(kind: EntityKind, value: string): string {
  return `${kind} ${value}`;
}

/** Which existing entity holds each spelling. A spelling held by two is claimed by both; the plan settles it. */
function bySpelling(existing: ExistingEntity[]): Map<string, ExistingEntity[]> {
  const index = new Map<string, ExistingEntity[]>();
  for (const entity of existing) {
    for (const name of entity.names) {
      const key = keyOf(entity.kind, name.value);
      const held = index.get(key);
      if (held) held.push(entity);
      else index.set(key, [entity]);
    }
  }
  return index;
}

/** How much of an existing entity this cluster took: the seen counts of the spellings they share. */
interface Claim {
  entity: ExistingEntity;
  /** The share of the existing entity's spellings that landed in this cluster. Decides a split. */
  part: number;
  /** The rank of the best of those spellings in the cluster, 0 being the cluster's most-seen. Decides a tie. */
  bestRank: number;
}

function claimsOf(cluster: ResolvedEntity, index: Map<string, ExistingEntity[]>): Map<number, Claim> {
  const claims = new Map<number, Claim>();
  cluster.names.forEach((name, rank) => {
    for (const entity of index.get(keyOf(cluster.kind, name.value)) ?? []) {
      const held = entity.names.find((own) => own.value === name.value);
      const claim = claims.get(entity.id);
      if (claim) {
        claim.part += held?.seenCount ?? 0;
        claim.bestRank = Math.min(claim.bestRank, rank);
      } else {
        claims.set(entity.id, { entity, part: held?.seenCount ?? 0, bestRank: rank });
      }
    }
  });
  return claims;
}

/**
 * A spelling two clusters now both hold means the old entity split. The larger
 * part keeps the id, which is what a reader opening the old link expects to
 * find: the thing they were looking at, minus a spelling.
 */
function settleSplits(claimed: Map<number, { at: number; claim: Claim }[]>, clusters: ResolvedEntity[]): Set<string> {
  const lost = new Set<string>();
  for (const [id, bidders] of claimed) {
    if (bidders.length < 2) continue;
    const ranked = [...bidders].sort(
      (a, b) =>
        b.claim.part - a.claim.part ||
        clusters[b.at].mentions.length - clusters[a.at].mentions.length ||
        (clusters[a.at].canonical < clusters[b.at].canonical ? -1 : 1),
    );
    for (const loser of ranked.slice(1)) lost.add(`${loser.at} ${id}`);
  }
  return lost;
}

/**
 * The survivor of a merge is the entity with the most mentions, not the one
 * holding the cluster's most-seen spelling.
 *
 * The two agree on every cluster the seeded inbox produces, and where they
 * disagree the mention count is the one worth following: what a kept id buys
 * is the profile and the verdicts written against it, and those describe the
 * evidence, not the spelling. The spelling is the tiebreak.
 */
function survivorOf(claims: Claim[]): Claim {
  return [...claims].sort(
    (a, b) => b.entity.mentionCount - a.entity.mentionCount || a.bestRank - b.bestRank || a.entity.id - b.entity.id,
  )[0];
}

export function reconcile(clusters: ResolvedEntity[], existing: ExistingEntity[]): ReconcilePlan {
  const index = bySpelling(existing);
  const perCluster = clusters.map((cluster) => claimsOf(cluster, index));

  const claimed = new Map<number, { at: number; claim: Claim }[]>();
  perCluster.forEach((claims, at) => {
    for (const [id, claim] of claims) {
      const bidders = claimed.get(id);
      if (bidders) bidders.push({ at, claim });
      else claimed.set(id, [{ at, claim }]);
    }
  });
  const lost = settleSplits(claimed, clusters);

  const plan: ReconcilePlan = { keep: [], insert: [], merge: [], drop: [] };
  const settled = new Set<number>();

  clusters.forEach((cluster, at) => {
    const claims = [...perCluster[at].values()].filter((claim) => !lost.has(`${at} ${claim.entity.id}`));
    if (claims.length === 0) {
      plan.insert.push(cluster);
      return;
    }
    const survivor = survivorOf(claims);
    plan.keep.push({ id: survivor.entity.id, cluster });
    settled.add(survivor.entity.id);
    for (const claim of claims) {
      if (claim.entity.id === survivor.entity.id) continue;
      plan.merge.push({ from: claim.entity.id, into: survivor.entity.id });
      settled.add(claim.entity.id);
    }
  });

  // An entity nothing claims has lost every spelling it held: the run that
  // produced them was deleted, or a person corrected the last one away. It
  // describes nothing now, so it goes, and with it the profile and the
  // verdicts that described it.
  for (const entity of existing) if (!settled.has(entity.id)) plan.drop.push(entity.id);
  return plan;
}
