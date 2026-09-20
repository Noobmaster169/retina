import type { GraphEdge, GraphNode, ObjectGraph, ObjectType } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * One email, one hop out, with every link named on it.
 *
 * The edge labels are facts and not decoration: `sent it` is the sender
 * domain, `carries` is the attachment, `judged into` is the comparison the two
 * documents rolled up to, and `found` is a field judgement that differed. A
 * reader who follows an edge learns which column of which table it was.
 *
 * No coordinates. The layout is one pure function in the frontend, so it has a
 * table-driven test and can be laid out again at a different width without
 * another round trip.
 */

/** Enough to read. Past this the graph stops being a picture and becomes a hairball. */
const MAX_CONTEXT = 4;
const MAX_DIFFERENCES = 6;

interface Rows {
  email_id: string;
  sender_domain: string;
  run_id: string;
  status: string | null;
  category: string | null;
  comparison_id: string | null;
}

interface DocRow {
  id: string;
  filename: string;
  role: string;
  fields: string;
}

interface DiffRow {
  id: string;
  field: string;
}

interface ContextRow {
  id: string;
  kind: ObjectType;
  canonical: string;
  field: string;
  mentions: number;
}

function node(
  id: string,
  type: ObjectType,
  label: string,
  sub: string,
  tone: GraphNode["tone"] = "neutral",
  focal = false,
): GraphNode {
  return { id, type, label, sub, focal, tone };
}

export async function emailGraph(
  db: Queryable,
  emailId: string,
  runId: string | null,
  hops: number,
): Promise<ObjectGraph | null> {
  const { rows } = await db.query<Rows>(
    `select er.email_id, em.sender_domain, er.run_id::text as run_id,
            cmp.status, coalesce(cl.human_category, cl.final_category) as category,
            cmp.id::text as comparison_id
       from core.email_runs er
       join core.emails em on em.email_id = er.email_id
       left join core.classifications cl on cl.email_run_id = er.id
       left join core.comparisons cmp on cmp.email_run_id = er.id
      where er.email_id = $1::text and ($2::uuid is null or er.run_id = $2::uuid)
      order by er.started_at desc
      limit 1`,
    [emailId, runId],
  );
  const email = rows[0];
  if (!email) return null;

  const [docs, diffs, context] = await Promise.all([
    db.query<DocRow>(
      `select d.id::text as id, a.filename, ex.role,
              (select count(*) from core.extraction_fields ef where ef.extraction_id = ex.id)::text as fields
         from core.extractions ex
         join core.documents d on d.id = ex.document_id
         join core.attachments a on a.id = d.attachment_id
         join core.email_runs er on er.id = ex.email_run_id
        where er.email_id = $1::text and ($2::uuid is null or er.run_id = $2::uuid)
        order by ex.role`,
      [emailId, runId],
    ),
    email.comparison_id
      ? db.query<DiffRow>(
          `select id::text as id, field from core.field_diffs
            where comparison_id = $1::bigint and not same and not missing
            order by field limit $2`,
          [email.comparison_id, MAX_DIFFERENCES],
        )
      : Promise.resolve({ rows: [] as DiffRow[] }),
    db.query<ContextRow>(
      `select e.id::text as id, e.kind::text as kind, e.canonical, m.field, e.mention_count as mentions
         from core.entity_mentions m
         join core.entities e on e.id = m.entity_id
         join core.email_runs er on er.id = m.email_run_id
        where er.email_id = $1::text and ($2::uuid is null or er.run_id = $2::uuid)
        group by e.id, e.kind, e.canonical, m.field, e.mention_count
        order by e.mention_count desc
        limit $3`,
      [emailId, runId, MAX_CONTEXT],
    ),
  ]);

  const focalTone: GraphNode["tone"] =
    email.status === "MISMATCH" ? "differ" : email.status === "NEEDS_REVIEW" ? "review" : email.status === "OK" ? "match" : "neutral";

  const nodes: GraphNode[] = [
    node(`client:${email.sender_domain}`, "client", email.sender_domain, "Client"),
    node(`email:${email.email_id}`, "email", email.email_id, `Email, ${email.category ?? "not sorted"}`, focalTone, true),
  ];
  const edges: GraphEdge[] = [
    { from: `client:${email.sender_domain}`, to: `email:${email.email_id}`, label: "sent it", tone: "neutral" },
  ];

  // The things read out of this email's documents, on the context side, each
  // edge named for the field it filled. The field name is the relation.
  for (const thing of context.rows) {
    const id = `${thing.kind}:${thing.id}`;
    if (!nodes.some((existing) => existing.id === id)) {
      nodes.push(node(id, thing.kind, thing.canonical, `${thing.kind === "port" ? "Port" : "Party"}, seen ${thing.mentions} times`));
    }
    edges.push({ from: id, to: `email:${email.email_id}`, label: thing.field, tone: "neutral" });
  }

  for (const doc of docs.rows) {
    const id = `document:${doc.id}`;
    nodes.push(node(id, "document", doc.filename, `Document, ${doc.fields} values read`));
    edges.push({ from: `email:${email.email_id}`, to: id, label: "carries", tone: "neutral" });
  }

  if (email.comparison_id) {
    const id = `comparison:${email.comparison_id}`;
    const differed = diffs.rows.length;
    nodes.push(
      node(id, "comparison", `comparison_${email.email_id.replace(/^email_/, "")}`, `Comparison, ${differed} differ`),
    );
    for (const doc of docs.rows) {
      edges.push({ from: `document:${doc.id}`, to: id, label: "judged into", tone: "neutral" });
    }
    // Amber, because a difference is the one thing on this canvas that means
    // something went wrong, and the edge carries that as much as the node.
    for (const diff of diffs.rows) {
      const diffId = `difference:${diff.id}`;
      nodes.push(node(diffId, "difference", diff.field, "Difference", "differ"));
      edges.push({ from: id, to: diffId, label: "found", tone: "differ" });
    }
  }

  if (hops >= 2) await addSecondHop(db, email, nodes, edges);

  return { focus: { type: "email", id: email.email_id }, nodes, edges, hops };
}

/**
 * The client's other emails that also had a defect.
 *
 * One traversal rather than every link type at two hops: the second ring of a
 * full expansion is forty nodes of things a reader did not ask about, and this
 * is the one they do ask about.
 */
async function addSecondHop(db: Queryable, email: Rows, nodes: GraphNode[], edges: GraphEdge[]): Promise<void> {
  const { rows } = await db.query<{ email_id: string; status: string }>(
    `select distinct er.email_id, c.status
       from core.email_runs er
       join core.emails em on em.email_id = er.email_id
       join core.comparisons c on c.email_run_id = er.id
      where em.sender_domain = $1::text and c.has_defect and er.email_id <> $2::text
      order by er.email_id
      limit $3`,
    [email.sender_domain, email.email_id, MAX_CONTEXT],
  );
  for (const sibling of rows) {
    const id = `email:${sibling.email_id}`;
    if (nodes.some((existing) => existing.id === id)) continue;
    nodes.push(node(id, "email", sibling.email_id, `Email, ${sibling.status}`, "differ"));
    edges.push({ from: `client:${email.sender_domain}`, to: id, label: "also sent", tone: "neutral" });
  }
}
