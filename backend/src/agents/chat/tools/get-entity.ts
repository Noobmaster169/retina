import { z } from "zod";

import { entityOverview } from "../../../ontology/repositories";
import { type ChatTool, refused, type ToolContext, type ToolOutcome } from "./types";

/** One resolved thing in full, by the id another tool returned. */

const GetInput = z.object({ id: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]) });
type GetInput = z.infer<typeof GetInput>;

export const getEntity: ChatTool<GetInput> = {
  name: "get_entity",
  description:
    "Everything about one resolved port or party by id: every spelling and how it joined, the fields it " +
    "appears in, and how many distinct emails and runs. Ids come from find_entity, list_entities or the orientation.",
  schema: GetInput,
  shape: GetInput.shape,

  async run(input, ctx: ToolContext): Promise<ToolOutcome> {
    if (!ctx.roPool) return refused("the read-only database connection is not configured, so nothing can be read");
    const thing = await entityOverview.overview(ctx.roPool, String(input.id));
    if (!thing) {
      return refused(`there is no resolved thing with id ${input.id}; find the name again with find_entity`, "core.entities");
    }
    const lines = [
      `[${thing.id}] ${thing.canonical} (${thing.kind})`,
      // Two spellings a later verdict joined became one thing. The id asked
      // for still leads here, and saying so is better than answering about a
      // thing the reader did not name.
      ...(thing.mergedFrom ? [`id ${thing.mergedFrom} was merged into this one`] : []),
      `distinct emails: ${thing.emails}, across ${thing.runs} ${thing.runs === 1 ? "run" : "runs"}`,
      "",
      "spelling\tseen\tjoined by\tconfidence",
      ...thing.names.map((name) => [name.value, name.seenCount, name.joinedBy, name.confidence ?? ""].join("\t")),
      "",
      "field\tmentions\temails",
      ...thing.byField.map((row) => [row.field, row.mentions, row.emails].join("\t")),
    ];
    return {
      ok: true,
      text: lines.join("\n"),
      preview: `${thing.canonical}: ${thing.names.length} spellings, ${thing.emails} emails`,
      touched: [
        { relation: "core.entity_names", count: thing.names.length },
        { relation: "core.entity_mentions", count: thing.byField.reduce((sum, row) => sum + row.mentions, 0) },
      ],
      entities: [thing.canonical],
      grounds: [thing.canonical, ...thing.names.map((name) => name.value)].join("\n"),
      things: [{ kind: thing.kind, canonical: thing.canonical, spellings: thing.names.map((name) => name.value) }],
    };
  },
};
