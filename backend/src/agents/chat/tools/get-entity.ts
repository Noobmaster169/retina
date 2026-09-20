import { z } from "zod";

import { entityOverview, entityProfile, sightings } from "../../../ontology/repositories";
import { type ChatTool, refused, type ToolContext, type ToolOutcome } from "./types";

/** One resolved thing in full, by the id another tool returned. */

const GetInput = z.object({ id: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]) });
type GetInput = z.infer<typeof GetInput>;

export const getEntity: ChatTool<GetInput> = {
  name: "get_entity",
  description:
    "Everything about one resolved thing by id: what it is, its stored attributes with where each came from, " +
    "every spelling and how it joined, and where it appears by role. Ids come from find_entity, find_entities, " +
    "list_entities or the orientation.",
  schema: GetInput,
  shape: GetInput.shape,

  async run(input, ctx: ToolContext): Promise<ToolOutcome> {
    if (!ctx.roPool) return refused("the read-only database connection is not configured, so nothing can be read");
    const thing = await entityOverview.overview(ctx.roPool, String(input.id));
    if (!thing) {
      return refused(`there is no resolved thing with id ${input.id}; find the name again with find_entity`, "core.entities");
    }
    const [profile, roles] = await Promise.all([
      entityProfile.read(ctx.roPool, thing.id),
      sightings.rolesOf(ctx.roPool, thing.id),
    ]);

    const lines = [
      `[${thing.id}] ${thing.canonical} (${thing.kind})`,
      // Two spellings a later verdict joined became one thing. The id asked
      // for still leads here, and saying so is better than answering about a
      // thing the reader did not name.
      ...(thing.mergedFrom ? [`id ${thing.mergedFrom} was merged into this one`] : []),
      `distinct emails: ${thing.emails}, across ${thing.runs} ${thing.runs === 1 ? "run" : "runs"}`,
    ];

    if (profile?.markdown) {
      // What it is, and where each attribute came from. A `model` source is the
      // model's own knowledge about the world, not a fact about this mailbox,
      // and an answer that repeats it says so.
      const attributes = Object.entries(profile.attributes)
        .filter(([, value]) => value !== null && value !== "")
        .map(([key, value]) => `${key}\t${value}\t${profile.attributeSources[key]?.source ?? "model"}`);
      lines.push("", profile.markdown);
      if (attributes.length > 0) lines.push("", "attribute\tvalue\tread from", ...attributes);
      if (profile.stale) lines.push("", "This profile is out of date: the mail has moved since it was written.");
    } else {
      lines.push("", "No profile has been written for this one yet.");
    }

    lines.push(
      "",
      "spelling\tseen\tjoined by\tconfidence",
      ...thing.names.map((name) => [name.value, name.seenCount, name.joinedBy, name.confidence ?? ""].join("\t")),
      "",
      "role\tappearances\temails",
      ...roles.map((role) => [role.role, role.appearances, role.emails].join("\t")),
    );

    return {
      ok: true,
      text: lines.join("\n"),
      preview: `${thing.canonical}: ${thing.names.length} spellings, ${thing.emails} emails${profile?.markdown ? ", profiled" : ", no profile yet"}`,
      touched: [
        { relation: "core.entity_names", count: thing.names.length },
        { relation: "core.entity_appearances", count: roles.reduce((sum, role) => sum + role.appearances, 0) },
      ],
      entities: [thing.canonical],
      // The stored name, its spellings and its attribute values. The profile's
      // prose is the model's own words about the thing, not data returned, so
      // it grounds nothing.
      grounds: [
        thing.canonical,
        ...thing.names.map((name) => name.value),
        ...Object.values(profile?.attributes ?? {}).filter((value): value is string => value !== null && value !== ""),
      ].join("\n"),
      things: [{ kind: thing.kind, canonical: thing.canonical, spellings: thing.names.map((name) => name.value) }],
    };
  },
};
