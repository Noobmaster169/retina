import { type ClientKind, type ClientRow, type ClientUpdate, DEFAULT_TIER } from "../../contracts";
import type { Queryable } from "../../db";

/** What a write answers with: the row as it now stands, and none of the counts a write did not read. */
export type StoredClient = Omit<ClientRow, "emails" | "mismatches">;

/**
 * The senders, their tier, and what each one has sent us.
 *
 * The list is driven by core.emails and not by core.clients, because a domain
 * that has emailed us is a sender whether or not anyone has ranked it. A
 * sender with no row shows its defaults and `known: false`, so the page can
 * say nobody chose them. Seeding every unknown domain instead would turn one
 * dataset's phishing senders into a list this product carries around.
 */

interface ClientDbRow {
  domain: string;
  name: string | null;
  tier: number | null;
  kind: ClientKind | null;
  emails?: string;
  mismatches?: string;
}

/** Counts default to 0 only where the caller did not ask for them; a write does not join the whole inbox to answer. */
function toRow(row: ClientDbRow): ClientRow {
  return {
    domain: row.domain,
    name: row.name,
    tier: row.tier ?? DEFAULT_TIER,
    kind: row.kind ?? "customer",
    known: row.tier !== null,
    emails: Number(row.emails ?? 0),
    mismatches: Number(row.mismatches ?? 0),
  };
}

/**
 * Every sender domain, ranked first and then alphabetical, with what it sent.
 *
 * A full outer join: a domain that has emailed us but has no client row, and a
 * client row for a domain that has not emailed yet, are both real and both
 * belong on the page. `awaiting_draft` is excluded from the mismatch count for
 * the same reason the run summary excludes it, so two screens cannot disagree.
 */
export async function list(db: Queryable): Promise<ClientRow[]> {
  const { rows } = await db.query<ClientDbRow>(
    `with sent as (
       select e.sender_domain as domain,
              count(distinct e.email_id) as emails,
              count(distinct e.email_id) filter (
                where c.status = 'MISMATCH' and not (c.detail ? 'awaiting_draft')
              ) as mismatches
         from core.emails e
         left join core.email_runs er on er.email_id = e.email_id
         left join core.comparisons c on c.email_run_id = er.id
        group by e.sender_domain
     )
     select coalesce(cl.domain, sent.domain) as domain,
            cl.name, cl.tier, cl.kind,
            coalesce(sent.emails, 0) as emails,
            coalesce(sent.mismatches, 0) as mismatches
       from sent
       full outer join core.clients cl on cl.domain = sent.domain
      order by coalesce(cl.tier, $1) asc, coalesce(sent.emails, 0) desc, 1 asc`,
    [DEFAULT_TIER],
  );
  return rows.map(toRow);
}

/** Domain to tier, for the Redis cache the enqueue path reads. Only rows a person could have set. */
export async function tiers(db: Queryable): Promise<Map<string, number>> {
  const { rows } = await db.query<{ domain: string; tier: number }>("select domain, tier from core.clients");
  return new Map(rows.map((row) => [row.domain, row.tier]));
}

/**
 * Writes what the page changed and leaves the rest. A domain with no row gets
 * one at the defaults, so ranking a sender the migration never seeded is the
 * same single call as ranking one it did.
 */
export async function upsert(db: Queryable, domain: string, patch: ClientUpdate): Promise<StoredClient> {
  // Every parameter is cast. Two untyped parameters inside one coalesce are
  // both inferred as text, and Postgres then refuses to write text into a
  // smallint column, which is a 500 on a route whose body validated fine.
  const { rows } = await db.query<ClientDbRow>(
    `insert into core.clients (domain, name, tier, kind)
     values ($1::text, $2::text, coalesce($3::smallint, $5::smallint), coalesce($4::text, 'customer'))
     on conflict (domain) do update set
       name = case when $6::boolean then excluded.name else core.clients.name end,
       tier = coalesce($3::smallint, core.clients.tier),
       kind = coalesce($4::text, core.clients.kind),
       updated_at = now()
     returning domain, name, tier, kind`,
    [domain, patch.name ?? null, patch.tier ?? null, patch.kind ?? null, DEFAULT_TIER, "name" in patch],
  );
  const row = rows[0];
  return { domain: row.domain, name: row.name, tier: row.tier ?? DEFAULT_TIER, kind: row.kind ?? "customer", known: true };
}
