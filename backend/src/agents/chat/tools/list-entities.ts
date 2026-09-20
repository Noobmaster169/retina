import { z } from "zod";

import { EntityKind } from "../../../contracts";
import { entitySearch } from "../../../ontology/repositories";
import { type ChatTool, refused, type ToolContext, type ToolOutcome } from "./types";

/** The resolved things of one kind, as a list the agent can read names and ids from. */

const ListInput = z.object({
  kind: EntityKind,
  /** A word any spelling must contain, such as a country. Case does not matter. */
  contains: z.string().min(2).max(80).optional(),
  limit: z.number().int().min(1).max(200).default(60),
});
type ListInput = z.infer<typeof ListInput>;

export const listEntities: ChatTool<ListInput> = {
  name: "list_entities",
  description:
    "Lists the resolved things of one kind (port, party, carrier, person, commodity, vessel), most mentioned " +
    "first, with ids and distinct email counts. Give " +
    "`contains` to keep those with a spelling containing a word, which is how a country's ports are found.",
  schema: ListInput,
  shape: ListInput.shape,

  async run(input, ctx: ToolContext): Promise<ToolOutcome> {
    if (!ctx.roPool) return refused("the read-only database connection is not configured, so nothing can be listed");
    const { rows, total } = await entitySearch.listing(ctx.roPool, input.kind, input.contains ?? null, input.limit);
    const what = `${input.kind} things${input.contains ? ` with a spelling containing "${input.contains}"` : ""}`;
    const lines = [
      `${total} ${what}${total > rows.length ? `; the ${rows.length} most mentioned are shown` : ""}.`,
      "",
      "id\tcanonical\tmentions\temails",
      ...rows.map((row) => [row.id, row.canonical, row.mentions, row.emails].join("\t")),
    ];
    return {
      ok: true,
      text: lines.join("\n"),
      preview: `${total} ${what}`,
      touched: [{ relation: "core.entities", count: total }],
      entities: rows.slice(0, 6).map((row) => row.canonical),
      // A row at a time, so each name keeps its counts: an alternative is kept
      // only where one row carried both the thing and the number.
      grounds: rows.map((row) => [row.id, row.canonical, row.mentions, row.emails].join("\t")).join("\n"),
      empty: total === 0,
      things: rows.map((row) => ({ kind: row.kind, canonical: row.canonical, spellings: [] })),
    };
  },
};
