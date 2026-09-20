import { z } from "zod";

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
  kind: z.enum(["port", "party"]).optional(),
});
type Input = z.infer<typeof Input>;

export const findEntity: ChatTool<Input> = {
  name: "find_entity",
  description:
    "Finds the resolved ports and parties a name could mean, by every spelling, with how each matched, its id, " +
    "and how many emails it appears in. Also reports the sender domains and subject lines where the name " +
    "appears. Call it for every company or place in a question before filtering on anything.",
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
      lines.push("No resolved port or party has a spelling close to it.");
    } else {
      lines.push("id\tkind\tcanonical\tmatched spelling\thow\tscore\tmentions\temails");
      for (const c of candidates) {
        lines.push([c.id, c.kind, c.canonical, c.matched, c.how, c.score, c.mentions, c.emails].join("\t"));
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
      grounds: [
        ...candidates.flatMap((candidate) => [candidate.canonical, candidate.matched]),
        ...elsewhere.senderDomains.map((domain) => domain.domain),
        ...elsewhere.subjects,
      ].join("\n"),
      empty: exact === 0,
    };
  },
};
