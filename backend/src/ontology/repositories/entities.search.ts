import type { Queryable } from "../../db";
import type { EntityKind } from "../../pipeline/ontology";

/**
 * Looking for a resolved thing by something a person typed.
 *
 * Similarity here proposes and never decides. `resolve.ts` bans edit distance
 * for merging two spellings into one thing, and that ban stands: nothing in
 * this file joins, renames or writes anything. It ranks candidates, every
 * candidate carries how it matched and how well, and the choice belongs to
 * whoever reads the list.
 */

/** Below this a spelling is not worth showing. It bounds the list; it decides nothing. */
const SIMILAR_FROM = 0.3;

export type MatchKind = "exact" | "same ignoring case" | "similar";

export interface EntityCandidate {
  id: string;
  kind: EntityKind;
  canonical: string;
  /** The spelling that matched, which is often not the canonical one. */
  matched: string;
  how: MatchKind;
  score: number;
  mentions: number;
  /** Distinct emails, not email runs: an email replayed in five runs is one email. */
  emails: number;
}

interface CandidateRow {
  id: string;
  kind: EntityKind;
  canonical: string;
  matched: string;
  rank: number;
  score: string;
  mention_count: number;
  emails: string;
}

const HOW: MatchKind[] = ["exact", "same ignoring case", "similar"];

export async function findCandidates(
  db: Queryable,
  text: string,
  kind: EntityKind | null,
  limit = 8,
): Promise<EntityCandidate[]> {
  const { rows } = await db.query<CandidateRow>(
    `with scored as (
       select n.entity_id,
              n.value,
              case when n.value = $1::text then 0
                   when lower(n.value) = lower($1::text) then 1
                   else 2 end as rank,
              greatest(word_similarity($1::text, n.value), similarity($1::text, n.value)) as score
         from core.entity_names n
         join core.entities e on e.id = n.entity_id
        where ($2::text is null or e.kind = $2::text)
     ), best as (
       select distinct on (entity_id) entity_id, value, rank, score
         from scored
        where rank < 2 or score > $3::real
        order by entity_id, rank asc, score desc
     )
     select e.id::text as id, e.kind, e.canonical, b.value as matched, b.rank, b.score::text as score,
            e.mention_count,
            (select count(distinct er.email_id)
               from core.entity_mentions m
               join core.email_runs er on er.id = m.email_run_id
              where m.entity_id = e.id)::text as emails
       from best b
       join core.entities e on e.id = b.entity_id
      order by b.rank asc, b.score desc, e.mention_count desc, e.canonical asc
      limit $4::int`,
    [text, kind, SIMILAR_FROM, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    canonical: row.canonical,
    matched: row.matched,
    how: HOW[row.rank],
    score: Number(Number(row.score).toFixed(2)),
    mentions: row.mention_count,
    emails: Number(row.emails),
  }));
}

export interface EntityListing {
  id: string;
  kind: EntityKind;
  canonical: string;
  mentions: number;
  emails: number;
}

/** The things of a kind, most mentioned first, optionally those with a spelling containing a word. */
export async function listing(
  db: Queryable,
  kind: EntityKind,
  contains: string | null,
  limit: number,
): Promise<{ rows: EntityListing[]; total: number }> {
  const { rows } = await db.query<EntityListing & { mentions: number; emails: string; total: string }>(
    `select e.id::text as id, e.kind, e.canonical, e.mention_count as mentions,
            (select count(distinct er.email_id)
               from core.entity_mentions m
               join core.email_runs er on er.id = m.email_run_id
              where m.entity_id = e.id)::text as emails,
            count(*) over ()::text as total
       from core.entities e
      where e.kind = $1::text
        and ($2::text is null or exists (
              select 1 from core.entity_names n
               where n.entity_id = e.id and n.value ilike '%' || $2::text || '%'))
      order by e.mention_count desc, e.canonical asc
      limit $3::int`,
    [kind, contains, limit],
  );
  return {
    rows: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      canonical: row.canonical,
      mentions: row.mentions,
      emails: Number(row.emails),
    })),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
}

/**
 * Which of these strings are, exactly, a stored name or identifier.
 *
 * The chat's guard refuses a filter on a string the agent was never shown. A
 * string that is character for character a stored spelling, an email id or a
 * sender is not a guess whoever typed it, so the guard asks here before
 * refusing.
 */
export async function knownValues(db: Queryable, values: string[]): Promise<string[]> {
  if (values.length === 0) return [];
  const { rows } = await db.query<{ v: string }>(
    `select v from unnest($1::text[]) as v
      where exists (select 1 from core.entity_names n where n.value = v)
         or exists (select 1 from core.entities e where e.canonical = v)
         or exists (select 1 from core.emails m where m.email_id = v or m.sender_domain = v or m.from_addr = v)`,
    [values],
  );
  return rows.map((row) => row.v);
}
