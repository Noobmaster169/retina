import type { Queryable } from "../../db";
import { chatState, orientation as orientationRepo } from "../../ontology/repositories";
import type { Counted, OrientationSnapshot } from "../../ontology/repositories/orientation.repo";

/**
 * The agent's first look at the database, so a session does not start blind.
 *
 * The values are queried, never written into a prompt file: which ports and
 * parties exist changes with every run and with a fresh seed. It is computed on
 * a conversation's first turn, kept on the conversation, and computed again only
 * when a run progressed or the resolved things were rebuilt.
 */

function counts(items: Counted[]): string {
  return items.length === 0 ? "none" : items.map((item) => `${item.label} ${item.count}`).join(", ");
}

function things(label: string, listed: OrientationSnapshot["ports"]): string[] {
  if (listed.total === 0) return [`${label}: none resolved yet.`];
  const rest = listed.total - listed.rows.length;
  const head =
    rest > 0
      ? `${label}: ${listed.total} in all. The ${listed.rows.length} most mentioned are below; list_entities reaches the other ${rest}.`
      : `${label}: all ${listed.total}.`;
  return [head, ...listed.rows.map((row) => `  [${row.id}] ${row.canonical} (${row.emails} emails)`)];
}

/** Pure: a snapshot in, the text the agent reads out. */
export function renderOrientation(snapshot: OrientationSnapshot): string {
  const lines: string[] = [];
  const { latestRun, run } = snapshot;

  if (!latestRun || !run) {
    lines.push("There are no runs yet, so there is nothing to count. Say so.");
  } else {
    lines.push(
      `Runs: ${snapshot.runs}. The latest is ${latestRun.id} (${latestRun.status}, ${latestRun.totalEmails ?? "?"} emails, created ${latestRun.createdAt.slice(0, 10)}).`,
      run.scoped
        ? `This conversation is about run ${run.id}. The figures below are for it.`
        : `This conversation names no run, so the figures below are for the latest run, ${run.id}.`,
      `Emails in that run: ${run.emails}. By stage: ${counts(run.stages)}.`,
      `By category: ${counts(snapshot.categories)}.`,
      `Comparisons by status: ${counts(snapshot.comparisons)}. Sent to a person by reason: ${counts(snapshot.reviews)}.`,
      `Emails whose documents were actually compared field by field: ${snapshot.judgedEmails}.`,
    );
  }

  lines.push(
    "",
    "Resolved things, built from every run together. The number in brackets is the id, good for this turn; the email counts are distinct emails across all runs.",
    ...things("Ports", snapshot.ports),
    ...things("Parties", snapshot.parties),
    "",
    `Sender domains, by emails in the inbox: ${counts(snapshot.senderDomains)}.`,
    "",
    "Not in the database as columns or things: when an email was sent, carriers, vessels, goods, references, people. They are text; search_emails finds them.",
  );
  return lines.join("\n");
}

/**
 * The conversation's orientation, from the row when it is still level with the
 * database and freshly computed when it is not.
 *
 * `read` is where the snapshot is taken (the read-only pool, so the orientation
 * can never show the agent something its own queries could not reach); `write`
 * is where the conversation row lives.
 */
export async function orientationFor(
  db: { read: Queryable; write: Queryable },
  conversation: { id: string; runId: string | null },
): Promise<string> {
  const [held, mark] = await Promise.all([
    chatState.orientationOf(db.write, conversation.id),
    orientationRepo.watermark(db.read),
  ]);
  if (held && held.watermark === mark && held.runId === conversation.runId) return held.text;

  const text = renderOrientation(await orientationRepo.snapshot(db.read, conversation.runId));
  await chatState.setOrientation(db.write, conversation.id, { text, watermark: mark, runId: conversation.runId });
  return text;
}
