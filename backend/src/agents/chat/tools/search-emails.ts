import { z } from "zod";

import { emailSearch } from "../../../ontology/repositories";
import { type ChatTool, refused, type ToolContext, type ToolOutcome } from "./types";

/** Emails by what their subject and body say, for everything that is text and not a column. */

const Input = z.object({
  /** Words or a reference, as written. Quotes make a phrase; `or` and a leading `-` work as in a web search. */
  text: z.string().min(2).max(200),
  runId: z.uuid().optional(),
  limit: z.number().int().min(1).max(50).default(15),
});
type Input = z.infer<typeof Input>;

export const searchEmails: ChatTool<Input> = {
  name: "search_emails",
  description:
    "Finds emails whose subject or body contain the words or the reference given, with sender, subject and a " +
    "snippet around the match. References, vessels, carriers, goods and terms are text, not columns: this is " +
    "how they are found. Give runId to keep only the emails of one run.",
  schema: Input,
  shape: Input.shape,

  async run(input, ctx: ToolContext): Promise<ToolOutcome> {
    if (!ctx.roPool) return refused("the read-only database connection is not configured, so no email can be searched");

    const { hits, total } = await emailSearch.searchEmails(ctx.roPool, input.text, input.runId ?? null, input.limit);
    const scope = input.runId ? ` in run ${input.runId}` : " in the whole inbox";
    const lines = [
      `${total} ${total === 1 ? "email matches" : "emails match"} "${input.text}"${scope}${total > hits.length ? `; ${hits.length} shown` : ""}.`,
    ];
    if (hits.length > 0) {
      lines.push("", "email_id\tsender_domain\tsubject\tmatched by\tsnippet");
      for (const hit of hits) {
        lines.push([hit.emailId, hit.senderDomain, hit.subject, hit.how, hit.snippet.replace(/\s+/g, " ")].join("\t"));
      }
    }
    return {
      ok: true,
      text: lines.join("\n"),
      preview: `${total} ${total === 1 ? "email" : "emails"} for "${input.text}"`,
      touched: [{ relation: "core.emails", count: total }],
      entities: hits.slice(0, 6).map((hit) => hit.emailId),
      empty: total === 0,
    };
  },
};
