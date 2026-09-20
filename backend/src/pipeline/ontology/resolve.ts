import type { ComparisonField, EntityKind } from "../../contracts";
import { Clusters } from "./clusters";

/**
 * Turns the values a model read into the things they denote.
 *
 * The only thing that ever merges two spellings is a verdict a model already
 * wrote: the field judge's `same = true` on a pair it compared, or the
 * `entity-resolve` step's `sameAs` on a spelling the field judge never saw.
 * There is no lowercasing, no punctuation stripping, no edit distance and no
 * lookup table, because all four are rules fitted to one sample of one dataset
 * and CLAUDE.md bans them for exactly that reason. Two spellings no judge ever
 * put together stay two things, and that is the correct answer rather than a
 * missing feature: the screen says how each spelling joined, so a reader can
 * see the difference.
 *
 * Pure. No database, no clock, no io. The caller loads the mentions, the
 * sightings and the verdicts, calls this, and plans what comes back with
 * `reconcile`.
 */

/** Which of the organisers' seven fields denote a thing, and which kind of thing. */
const KIND_OF_FIELD: Partial<Record<ComparisonField, EntityKind>> = {
  port_of_loading: "port",
  port_of_discharge: "port",
  shipper: "party",
  consignee: "party",
  notify_party: "party",
};

/** How a spelling came to be part of a thing. Nothing writes `human` until the action-card contract lands. */
export type JoinedBy = "kept" | "judge" | "human";

/** One value as one document had it, at the point the extractor read it. */
export interface Mention {
  extractionFieldId: number;
  emailRunId: number;
  field: ComparisonField;
  value: string;
  seenAt: Date;
}

/**
 * One value read somewhere a comparison field cannot reach: a subject line, a
 * body, a forwarded header, or a part of a document that is not one of the
 * seven. It joins the same clusters a mention does and carries no extraction
 * field, because there is none behind it.
 */
export interface Sighting {
  kind: EntityKind;
  value: string;
  seenAt: Date;
}

/**
 * One pair a judge said denotes the same thing.
 *
 * `field` is set by the field judge, which compares two documents' values.
 * `kind` is set by `entity-resolve`, which judged a spelling against a
 * candidate and has no field behind it. Only `same` pairs join anything.
 */
export interface Verdict {
  field?: ComparisonField;
  kind?: EntityKind;
  siValue: string | null;
  blValue: string | null;
  same: boolean;
  confidence: number | null;
  /** Which step judged it. Null for the field judge, which is the one that has always been here. */
  step?: string | null;
}

export interface ResolvedName {
  value: string;
  seenCount: number;
  joinedBy: JoinedBy;
  /** How sure the judge was, on the verdict that joined this spelling. Null on the kept one. */
  confidence: number | null;
  /** Which step's verdict joined it, where it was not the field judge. Null on the kept one and on a field-judge join. */
  joinedStep: string | null;
}

export interface ResolvedEntity {
  kind: EntityKind;
  /** The spelling seen the most. Ties go to the lower string, so a rebuild is stable. */
  canonical: string;
  names: ResolvedName[];
  mentions: Mention[];
  /** How many sightings, which carry no row of their own here, fell into this thing. */
  sightingCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

/** A value that is only whitespace is not a value. Nothing else is touched. */
function usable(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function keyOf(kind: EntityKind, value: string): string {
  return `${kind} ${value}`;
}

function kindOf(verdict: Verdict): EntityKind | undefined {
  return verdict.kind ?? (verdict.field ? KIND_OF_FIELD[verdict.field] : undefined);
}

/** Every occurrence of one spelling, from wherever it was read. */
interface Spelling {
  kind: EntityKind;
  value: string;
  mentions: Mention[];
  sightings: number;
  times: number[];
}

function occurrences(mentions: Mention[], sightings: Sighting[]): Map<string, Spelling> {
  const seen = new Map<string, Spelling>();
  const put = (kind: EntityKind, value: string, at: Date): Spelling => {
    const key = keyOf(kind, value);
    let held = seen.get(key);
    if (!held) {
      held = { kind, value, mentions: [], sightings: 0, times: [] };
      seen.set(key, held);
    }
    held.times.push(at.getTime());
    return held;
  };

  for (const mention of mentions) {
    const kind = KIND_OF_FIELD[mention.field];
    if (!kind || !usable(mention.value)) continue;
    put(kind, mention.value, mention.seenAt).mentions.push(mention);
  }
  for (const sighting of sightings) {
    if (!usable(sighting.value)) continue;
    put(sighting.kind, sighting.value, sighting.seenAt).sightings += 1;
  }
  return seen;
}

/** How confidently each spelling was ever judged the same as another, and by which step. */
interface Join {
  confidence: number | null;
  step: string | null;
}

function joinsFrom(verdicts: Verdict[], seen: Map<string, Spelling>, clusters: Clusters): Map<string, Join> {
  // Kept per spelling rather than per edge because the screen shows one number
  // beside a spelling, not one per comparison it took part in.
  const joins = new Map<string, Join>();
  for (const verdict of verdicts) {
    const kind = kindOf(verdict);
    if (!kind || !verdict.same) continue;
    if (!usable(verdict.siValue) || !usable(verdict.blValue)) continue;
    const si = keyOf(kind, verdict.siValue);
    const bl = keyOf(kind, verdict.blValue);
    // A judged value nothing was ever read from is not a thing this pass saw;
    // joining on it would invent a spelling nothing can be traced to.
    if (!seen.has(si) || !seen.has(bl) || si === bl) continue;
    for (const key of [si, bl]) {
      const held = joins.get(key);
      const offered = verdict.confidence;
      if (held === undefined || (offered !== null && (held.confidence === null || offered > held.confidence))) {
        joins.set(key, { confidence: offered, step: verdict.step ?? null });
      }
    }
    clusters.union(si, bl);
  }
  return joins;
}

export function resolveEntities(mentions: Mention[], verdicts: Verdict[], sightings: Sighting[] = []): ResolvedEntity[] {
  const seen = occurrences(mentions, sightings);
  const clusters = new Clusters();
  for (const key of seen.keys()) clusters.add(key);

  const joins = joinsFrom(verdicts, seen, clusters);

  const grouped = new Map<string, string[]>();
  for (const key of seen.keys()) {
    const root = clusters.find(key);
    const members = grouped.get(root);
    if (members) members.push(key);
    else grouped.set(root, [key]);
  }

  const entities: ResolvedEntity[] = [];
  for (const members of grouped.values()) {
    const counted = members
      .map((key) => {
        const own = seen.get(key) as Spelling;
        return { key, own, seenCount: own.mentions.length + own.sightings };
      })
      // Most seen wins the canonical spelling; the value breaks the tie so two
      // runs of the resolver over the same data always agree.
      .sort((a, b) => b.seenCount - a.seenCount || (a.own.value < b.own.value ? -1 : a.own.value > b.own.value ? 1 : 0));

    const kept = counted[0];
    const times = counted.flatMap((member) => member.own.times);

    entities.push({
      kind: kept.own.kind,
      canonical: kept.own.value,
      names: counted.map((member) => ({
        value: member.own.value,
        seenCount: member.seenCount,
        joinedBy: member.key === kept.key ? "kept" : "judge",
        confidence: member.key === kept.key ? null : (joins.get(member.key)?.confidence ?? null),
        joinedStep: member.key === kept.key ? null : (joins.get(member.key)?.step ?? null),
      })),
      mentions: counted.flatMap((member) => member.own.mentions),
      sightingCount: counted.reduce((sum, member) => sum + member.own.sightings, 0),
      firstSeenAt: new Date(Math.min(...times)),
      lastSeenAt: new Date(Math.max(...times)),
    });
  }

  return entities.sort(
    (a, b) =>
      b.mentions.length + b.sightingCount - (a.mentions.length + a.sightingCount) ||
      (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) ||
      (a.canonical < b.canonical ? -1 : 1),
  );
}
