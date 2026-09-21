import { z } from "zod";

import { EntityKind } from "../../../contracts";
import { emailSearch, entitySearch } from "../../../ontology/repositories";
import { type ChatTool, refused, type ToolContext, type ToolOutcome } from "./types";

/**
 * What a name in a question could mean in the data.
 *
 * It returns candidates and chooses none of them. The agent reads how each one
 * matched and how well, decides, and says which it took.
 */

const Input = z.object({
  /** The name as the person wrote it. */
  text: z.string().min(2).max(200),
  kind: EntityKind.optional(),
});
type Input = z.infer<typeof Input>;

export const findEntity: ChatTool<Input> = {
  name: "find_entity",
  description:
    "Finds the resolved things a name could mean, of any kind (port, party, carrier, person, commodity, vessel), " +
    "by every spelling, with how each matched, its id, how many emails it appears in, and a line on what it is. " +
    "Also reports the sender domains and subject lines where the name appears. Call it for every company, place, " +
    "carrier, vessel or person in a question before filtering on anything.",
  schema: Input,
  shape: Input.shape,

  async run(input, ctx: ToolContext): Promise<ToolOutcome> {
    if (!ctx.roPool) return refused("the read-only database connection is not configured, so nothing can be looked up");

    const [candidates, elsewhere] = await Promise.all([
      entitySearch.findCandidates(ctx.roPool, input.text, input.kind ?? null),
      emailSearch.elsewhere(ctx.roPool, input.text),
    ]);

    const lines = [`Looking for "${input.text}"${input.kind ? ` among ${input.kind} things` : ""}.`, ""];
    if (candidates.length === 0) {
      lines.push("No resolved thing has a spelling close to it.");
    } else {
      lines.push("id\tkind\tcanonical\tmatched spelling\thow\tscore\tmentions\temails\twhat it is");
      for (const c of candidates) {
        lines.push([c.id, c.kind, c.canonical, c.matched, c.how, c.score, c.mentions, c.emails, c.summary].join("\t"));
      }
      if (!candidates.some((candidate) => candidate.how !== "similar")) {
        lines.push("None of these is an exact match. Read them and decide which, if any, the name means.");
      }
    }

    lines.push("", "Elsewhere:");
    lines.push(
      elsewhere.senderDomains.length > 0
        ? `sender domains that look like it: ${elsewhere.senderDomains.map((d) => `${d.domain} (${d.emails} emails)`).join(", ")}`
        : "no sender domain looks like it",
    );
    lines.push(`emails with every word of it in the subject or body: ${elsewhere.emailsMentioning}`);
    for (const subject of elsewhere.subjects) lines.push(`  subject: ${subject}`);

    const exact = candidates.filter((candidate) => candidate.how !== "similar").length;
    return {
      ok: true,
      text: lines.join("\n"),
      preview: `${candidates.length} ${candidates.length === 1 ? "candidate" : "candidates"}, ${exact} exact; ${elsewhere.emailsMentioning} emails mention it`,
      touched: [
        { relation: "core.entity_names", count: candidates.length },
        { relation: "core.emails", count: elsewhere.emailsMentioning },
      ],
      entities: candidates.slice(0, 6).map((candidate) => candidate.canonical),
      // A row at a time, with each name's counts beside it: an alternative the
      // answer offers is kept only where one row carried both the thing and the
      // number, so splitting them here would drop every real suggestion.
      grounds: [
        ...candidates.map((c) => [c.id, c.kind, c.canonical, c.matched, c.mentions, c.emails, c.summary].join("\t")),
        ...elsewhere.senderDomains.map((domain) => `${domain.domain}\t${domain.emails}`),
        ...elsewhere.subjects,
      ].join("\n"),
      empty: exact === 0,
      // A name that means both a place and a company is the ambiguity worth asking about.
      ambiguous: new Set(candidates.map((candidate) => candidate.kind)).size > 1,
      mentions: candidates.map((candidate) => ({ id: String(candidate.id), kind: candidate.kind, canonical: candidate.canonical })),
      things: candidates.map((candidate) => ({
        kind: candidate.kind,
        canonical: candidate.canonical,
        spellings: candidate.matched === candidate.canonical ? [] : [candidate.matched],
      })),
    };
  },
};
