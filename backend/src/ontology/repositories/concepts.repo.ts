import type { EntityKind } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * A term a question used that is written nowhere in the database, and what the
 * model judged about each thing under it.
 *
 * A verdict is kept against the profile version it read. That is the whole
 * cost model: a question asked twice is a lookup, and a profile rewritten
 * since makes exactly the things it describes worth judging again.
 */

export interface Concept {
  id: string;
  entityKind: EntityKind;
  phrase: string;
  definition: string;
  searchTerms: string[];
  askedCount: number;
}

interface ConceptRow {
  id: string;
  entity_kind: EntityKind;
  phrase: string;
  definition: string;
  search_terms: string[];
  asked_count: number;
}

const toConcept = (row: ConceptRow): Concept => ({
  id: row.id,
  entityKind: row.entity_kind,
  phrase: row.phrase,
  definition: row.definition,
  searchTerms: row.search_terms,
  askedCount: row.asked_count,
});

/** The concepts whose phrase is near this one, for the define step to reuse rather than duplicate. */
export async function near(db: Queryable, kind: EntityKind, phrase: string, limit = 5): Promise<Concept[]> {
  const { rows } = await db.query<ConceptRow>(
    `select id::text as id, entity_kind, phrase, definition, search_terms, asked_count
       from core.concepts
      where entity_kind = $1::text and public.similarity(phrase, $2::text) > 0.3
      order by public.similarity(phrase, $2::text) desc
      limit $3::int`,
    [kind, phrase, limit],
  );
  return rows.map(toConcept);
}

export async function find(db: Queryable, id: string): Promise<Concept | null> {
  const { rows } = await db.query<ConceptRow>(
    "select id::text as id, entity_kind, phrase, definition, search_terms, asked_count from core.concepts where id = $1::bigint",
    [id],
  );
  return rows[0] ? toConcept(rows[0]) : null;
}

export interface NewConcept {
  entityKind: EntityKind;
  phrase: string;
  definition: string;
  searchTerms: string[];
}

export async function create(db: Queryable, concept: NewConcept): Promise<Concept> {
  const { rows } = await db.query<ConceptRow>(
    `insert into core.concepts (entity_kind, phrase, definition, search_terms)
     values ($1::text, $2::text, $3::text, $4::text[])
     returning id::text as id, entity_kind, phrase, definition, search_terms, asked_count`,
    [concept.entityKind, concept.phrase, concept.definition, concept.searchTerms],
  );
  return toConcept(rows[0]);
}

/** One more asking. A concept asked twice earns a background backfill; one asked once does not. */
export async function bump(db: Queryable, id: string): Promise<number> {
  const { rows } = await db.query<{ asked_count: number }>(
    "update core.concepts set asked_count = asked_count + 1 where id = $1::bigint returning asked_count",
    [id],
  );
  return rows[0]?.asked_count ?? 0;
}

export interface StoredVerdict {
  entityId: number;
  verdict: "yes" | "no" | "unknown";
  confidence: number;
  rationale: string;
  /** The profile version this was judged against. A higher one on the entity makes it stale. */
  profileVersion: number;
}

/** Every verdict this concept already holds for these things, with the version each was judged against. */
export async function verdictsFor(db: Queryable, conceptId: string, entityIds: number[]): Promise<StoredVerdict[]> {
  if (entityIds.length === 0) return [];
  const { rows } = await db.query<{ entity_id: string; verdict: StoredVerdict["verdict"]; confidence: string; rationale: string; profile_version: number }>(
    `select entity_id::text as entity_id, verdict, confidence::text as confidence, rationale, profile_version
       from core.concept_verdicts
      where concept_id = $1::bigint and entity_id = any($2::bigint[])`,
    [conceptId, entityIds.map(String)],
  );
  return rows.map((row) => ({
    entityId: Number(row.entity_id),
    verdict: row.verdict,
    confidence: Number(row.confidence),
    rationale: row.rationale,
    profileVersion: row.profile_version,
  }));
}

export async function saveVerdicts(tx: Queryable, conceptId: string, verdicts: StoredVerdict[], llmCallId: number | null = null): Promise<void> {
  for (const verdict of verdicts) {
    await tx.query(
      `insert into core.concept_verdicts (concept_id, entity_id, verdict, confidence, rationale, profile_version, llm_call_id)
       values ($1::bigint, $2::bigint, $3::text, $4::numeric, $5::text, $6::int, $7::bigint)
       on conflict (concept_id, entity_id) do update set
         verdict = excluded.verdict, confidence = excluded.confidence, rationale = excluded.rationale,
         profile_version = excluded.profile_version, llm_call_id = excluded.llm_call_id, decided_at = now()`,
      [conceptId, verdict.entityId, verdict.verdict, verdict.confidence, verdict.rationale, verdict.profileVersion, llmCallId],
    );
  }
}

/** How many things this concept has judged each way. What the reading line under an answer says. */
export async function tally(db: Queryable, conceptId: string): Promise<Record<"yes" | "no" | "unknown", number>> {
  const { rows } = await db.query<{ verdict: "yes" | "no" | "unknown"; n: string }>(
    "select verdict, count(*)::text as n from core.concept_verdicts where concept_id = $1::bigint group by verdict",
    [conceptId],
  );
  const counts = { yes: 0, no: 0, unknown: 0 };
  for (const row of rows) counts[row.verdict] = Number(row.n);
  return counts;
}

/** Marks a concept worth finishing in the background. A one-off phrase never gets this. */
export async function wantBackfill(db: Queryable, id: string): Promise<void> {
  await db.query("update core.concepts set backfill_wanted = true where id = $1::bigint", [id]);
}

export async function doneBackfilling(db: Queryable, id: string): Promise<void> {
  await db.query("update core.concepts set backfill_wanted = false where id = $1::bigint", [id]);
}

/** The concepts asked to be finished, oldest first, for the scheduled backfill. */
export async function wantingBackfill(db: Queryable, limit = 1): Promise<Concept[]> {
  const { rows } = await db.query<ConceptRow>(
    `select id::text as id, entity_kind, phrase, definition, search_terms, asked_count
       from core.concepts where backfill_wanted order by id limit $1::int`,
    [limit],
  );
  return rows.map(toConcept);
}
