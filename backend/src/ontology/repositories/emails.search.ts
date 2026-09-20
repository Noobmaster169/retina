import type { Queryable } from "../../db";

/**
 * Finding emails by what their subject and body say.
 *
 * References, vessels, carrier codes and terms are not columns: they live in
 * the text. `core.emails.search` is a 'simple' tsvector, so `5RFR-36541` is
 * found as written. The trigram pass over the subject is the fallback for a
 * code the tokenizer splits in a way the query did not.
 */

export interface EmailHit {
  emailId: string;
  fromAddr: string;
  senderDomain: string;
  subject: string;
  snippet: string;
  how: "text" | "subject contains";
}

interface HitRow {
  email_id: string;
  from_addr: string;
  sender_domain: string;
  subject: string;
  snippet: string;
  how: "text" | "subject contains";
  total: string;
}

export async function searchEmails(
  db: Queryable,
  text: string,
  runId: string | null,
  limit: number,
): Promise<{ hits: EmailHit[]; total: number }> {
  const { rows } = await db.query<HitRow>(
    `with q as (select websearch_to_tsquery('simple', $1::text) as query),
     hits as (
       select e.email_id, e.from_addr, e.sender_domain, e.subject,
              case when e.search @@ q.query then 'text' else 'subject contains' end as how,
              ts_headline('simple', e.subject || ' ' || e.body, q.query,
                          'MaxWords=24, MinWords=8, MaxFragments=1, StartSel=[, StopSel=]') as snippet,
              ts_rank(e.search, q.query) as score
         from core.emails e, q
        where (e.search @@ q.query or e.subject ilike '%' || $1::text || '%')
          and ($2::uuid is null or exists (
                select 1 from core.email_runs er where er.email_id = e.email_id and er.run_id = $2::uuid))
     )
     select email_id, from_addr, sender_domain, subject, snippet, how, count(*) over ()::text as total
       from hits
      order by score desc, email_id asc
      limit $3::int`,
    [text, runId, limit],
  );
  return {
    hits: rows.map((row) => ({
      emailId: row.email_id,
      fromAddr: row.from_addr,
      senderDomain: row.sender_domain,
      subject: row.subject,
      snippet: row.snippet,
      how: row.how,
    })),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
}

export interface Elsewhere {
  /** Sender domains whose name and the text share most of their letters. Proposed, never asserted. */
  senderDomains: { domain: string; emails: number }[];
  /** How many emails carry every word of the text in their subject or body. */
  emailsMentioning: number;
  subjects: string[];
}

/**
 * The other places a name lives besides the resolved things: a sender domain,
 * a subject line, the prose of a body. A company is all of these at once, and
 * an answer that checked one of them has not answered.
 */
export async function elsewhere(db: Queryable, text: string): Promise<Elsewhere> {
  const [domains, mentions] = await Promise.all([
    db.query<{ domain: string; emails: string }>(
      `with t as (select regexp_replace(lower($1::text), '[^a-z0-9]', '', 'g') as squashed),
       d as (select sender_domain as domain, split_part(sender_domain, '.', 1) as label, count(*) as emails
               from core.emails group by sender_domain)
       select d.domain, d.emails::text as emails
         from d, t
        where length(t.squashed) >= 3 and length(d.label) >= 3
          and (position(d.label in t.squashed) > 0 or position(t.squashed in d.label) > 0
               or similarity(d.label, t.squashed) > 0.45)
        order by d.emails desc
        limit 5`,
      [text],
    ),
    db.query<{ subject: string; total: string }>(
      `select e.subject, count(*) over ()::text as total
         from core.emails e
        where e.search @@ websearch_to_tsquery('simple', $1::text)
        order by e.email_id asc
        limit 5`,
      [text],
    ),
  ]);
  return {
    senderDomains: domains.rows.map((row) => ({ domain: row.domain, emails: Number(row.emails) })),
    emailsMentioning: mentions.rows[0] ? Number(mentions.rows[0].total) : 0,
    subjects: mentions.rows.map((row) => row.subject),
  };
}
