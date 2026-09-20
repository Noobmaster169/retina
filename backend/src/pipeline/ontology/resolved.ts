import type { ComparisonField, EntityKind } from "../../contracts";

/**
 * What a resolution pass reads and what it produces.
 *
 * Apart from `resolve.ts`, which is the algorithm: these shapes are what four
 * repositories, the reconciler and the writer all agree on, and none of them
 * needs the union-find to say so.
 */

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
