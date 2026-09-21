import type { EntityKind } from "../../contracts";

/**
 * The links in an answer, and whether the agent was shown what it linked to.
 *
 * The failure this exists for: an answer names a company and the reader has to
 * go and find it again by hand. The fix is for the agent to write the id it
 * already holds, as `[Evergreen Marine](entity:412)`, which the page draws as
 * a link into that thing's page.
 *
 * The failure that fix would bring: an id written from memory rather than from
 * a result, leading somewhere else or nowhere. So a link is kept only when a
 * tool on this turn put that id in front of the agent, which is the same test
 * `grounding.ts` applies to a SQL literal. A link that fails it loses its
 * markup and stays as the words it wrapped, so the sentence still reads.
 *
 * Pure: an answer and what was shown in, an answer out.
 */

/** One resolved thing a tool put in front of the agent, by the id it printed. */
export interface ResolvedMention {
  id: string;
  kind: EntityKind;
  canonical: string;
}

/** `[text](entity:<ref>)`, the only link shape the answer may write. */
const LINK = /\[([^\]\n]+)\]\(entity:([^)\s]*)\)/g;

/** The id in a written ref, whether or not the agent wrote a kind before it. */
function idIn(ref: string): string {
  const last = ref.slice(ref.lastIndexOf("/") + 1);
  return /^\d+$/.test(last) ? last : "";
}

/**
 * Every link resolved against what the turn was shown.
 *
 * A kept link is rewritten to carry the kind, because the id alone does not say
 * whether the page to open is a company's or a port's, and the frontend must
 * not have to ask the database to find out where a link goes.
 */
export function linkAnswer(answer: string, shown: ResolvedMention[]): string {
  if (!answer.includes("](entity:")) return answer;
  const known = new Map(shown.map((mention) => [mention.id, mention]));
  return answer.replace(LINK, (whole, text: string, ref: string) => {
    const mention = known.get(idIn(ref));
    return mention ? `[${text}](entity:${mention.kind}/${mention.id})` : text;
  });
}

/** The ids an answer linked to, in order, for a caller that wants to count them. */
export function linkedIds(answer: string): string[] {
  return [...answer.matchAll(LINK)].map((match) => idIn(match[2])).filter((id) => id !== "");
}
