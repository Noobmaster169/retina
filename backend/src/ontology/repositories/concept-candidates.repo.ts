import type { EntityKind } from "../../contracts";
import type { Queryable } from "../../db";
import type { Candidate, JudgeSubject } from "../../pipeline/ontology";

/**
 * Which things a concept question could be about, ranked, and what the judge
 * is shown about the ones it actually judges.
 *
 * Two queries and not one, because they answer at two sizes. The ranking runs
 * over every candidate of the kind, up to the cap, and reads two columns per
 * row. The dossier runs over the few hundred the budget allows and reads the
 * whole profile. Reading profiles for five thousand things to then judge four
 * hundred of them would give up the bound at the first query.
 */

/**
 * Ranked by how well a profile's text matches the concept's search terms.
 *
 * The terms rank and never decide: a thing the ranking puts last is judged
 * exactly as one it puts first would be, and the only thing ranking changes is
 * which four hundred get judged when there are five thousand.
 */
export async function ranked(db: Queryable, kind: EntityKind, terms: string[], ids: number[] | null, cap: number): Promise<Candidate[]> {
  const query = terms.filter((term) => /\p{L}/u.test(term)).join(" OR ");
  const narrowed = ids === null ? null : ids.map(String);

  // Two legs, because neither alone is both indexed and complete.
  //
  // The first takes the things whose profile actually matches the search
  // terms, best first. The GIN index on `search` serves the filter, and
  // ranking inside its result is cheap because that result is small.
  //
  // The second tops the list up with the most-seen things of the kind the
  // terms did not reach, which is what keeps the candidate set complete rather
  // than only what the terms happened to find. `entities_ranked` serves it.
  // One `order by ts_rank` over the whole kind would have done both and was a
  // sequential scan and a top-N sort at 200,000, which is what
  // `pnpm ontology:bench` is for.
  const matched =
    query === ""
      ? []
      : (
          await db.query<{ id: string; profile_version: number }>(
            `select e.id::text as id, e.profile_version
               from core.entities e
              where e.kind = $1::text and e.merged_into is null
                and e.search @@ websearch_to_tsquery('simple', $2::text)
                and ($3::bigint[] is null or e.id = any($3::bigint[]))
              order by ts_rank(e.search, websearch_to_tsquery('simple', $2::text)) desc, e.id
              limit $4::int`,
            [kind, query, narrowed, cap],
          )
        ).rows;

  const rest =
    matched.length >= cap
      ? []
      : (
          await db.query<{ id: string; profile_version: number }>(
            `select e.id::text as id, e.profile_version
               from core.entities e
              where e.kind = $1::text and e.merged_into is null
                and ($2::bigint[] is null or e.id = any($2::bigint[]))
                and not (e.id = any($3::bigint[]))
              order by (e.mention_count + e.sighting_count) desc, e.id
              limit $4::int`,
            [kind, narrowed, matched.map((row) => row.id), cap - matched.length],
          )
        ).rows;

  return [...matched, ...rest].map((row) => ({ entityId: Number(row.id), profileVersion: row.profile_version }));
}

/** Everything the judge reads about one thing. A thing with no profile yet is still judged, on its name alone. */
export async function subjects(db: Queryable, ids: number[]): Promise<JudgeSubject[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<{
    id: string;
    canonical: string;
    attributes: Record<string, string | null>;
    profile_md: string | null;
  }>(
    `select id::text as id, canonical, attributes, profile_md
       from core.entities where id = any($1::bigint[]) and merged_into is null`,
    [ids.map(String)],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.canonical,
    attributes: row.attributes,
    summary: section(row.profile_md, null) || "No profile has been written for this one yet; judge it on its name and attributes alone.",
    observed: section(row.profile_md, "What our mail shows"),
    general: section(row.profile_md, "General knowledge") || null,
  }));
}

/**
 * One section of a rendered profile, by its heading, or the summary when the
 * heading is null.
 *
 * Reading the Markdown back rather than storing the parts twice: the render is
 * pure and its headings are fixed, and a second copy of the same prose in
 * columns is a second thing to keep level.
 */
function section(markdown: string | null, heading: string | null): string {
  if (markdown === null) return "";
  const parts = markdown.split(/^## /m);
  if (heading === null) {
    // Everything before the first heading, minus the title and the kind line.
    return parts[0].split("\n").slice(2).join("\n").trim();
  }
  const found = parts.slice(1).find((part) => part.startsWith(heading));
  return found ? found.split("\n").slice(1).join("\n").trim() : "";
}

/** How many things of a kind there are to judge at all, for the completeness the answer reports. */
export async function countOfKind(db: Queryable, kind: EntityKind): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    "select count(*)::text as n from core.entities where kind = $1::text and merged_into is null",
    [kind],
  );
  return Number(rows[0].n);
}
