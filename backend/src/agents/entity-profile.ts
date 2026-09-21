import { z } from "zod";

import { ATTRIBUTES, type EntityKind, EntityProfile, PartyAttributes, PortAttributes } from "../contracts";
import type { Dossier } from "../pipeline/ontology";
import { WORKER_PROJECT } from "./classify";
import type { Prompt } from "./prompts/registry";
import { callStructured, type StructuredDeps, type StructuredResult } from "./structured";

/**
 * What one thing is, written from a dossier of fixed size.
 *
 * Two knowledge sources and the profile says which is which. `observed` is
 * only what the dossier shows; `general` is what the model knows from
 * training, marked unverified with a confidence of its own, and null when
 * `ONTOLOGY_KNOWLEDGE` is `mail`, when the model knows nothing, and always for
 * a person.
 */

/**
 * The output schema, built per kind so the attributes are exactly that kind's.
 *
 * Per call rather than a union, for the same reason the field judge's is: a
 * top-level union is refused by the provider, and a schema that allowed every
 * kind's attributes would let a port answer with an HS chapter.
 */
/** The keys the reference list owns are never the model's to guess: a coordinate or a country code a model made up is worse than none. */
function attributesFor(kind: EntityKind): z.ZodType {
  if (kind === "port") return PortAttributes.omit({ countryCode: true, lat: true, lon: true });
  if (kind === "party") return PartyAttributes.omit({ countryCode: true });
  return ATTRIBUTES[kind];
}

export function profileSchema(kind: EntityKind): z.ZodType<ProfileOutput> {
  return z.object({
    summary: z.string().min(1).max(400),
    observed: z.string().min(1).max(2000),
    general: z.string().max(2000).nullable(),
    generalConfidence: z.number().min(0).max(1).nullable(),
    attributes: attributesFor(kind),
    /** Per attribute you filled: `mail` if the dossier carried it, `model` if you knew it. */
    attributeBasis: z.record(z.string(), z.enum(["mail", "model"])),
    unknowns: z.array(z.string().max(200)).max(8),
  }) as z.ZodType<ProfileOutput>;
}

export interface ProfileOutput extends EntityProfile {
  attributes: Record<string, string | null>;
  attributeBasis: Record<string, "mail" | "model">;
}

export interface EntityProfileInput {
  dossier: Dossier;
  /** False when ONTOLOGY_KNOWLEDGE is `mail`, and always for a person. The prompt then asks for null. */
  allowGeneral: boolean;
}

/**
 * One call per stale thing.
 *
 * It belongs to no run: a profile describes a thing across every run that ever
 * saw it, and charging its tokens to whichever run happened to touch it last
 * would make that run's cost a lie. Same argument as the chat's, in
 * `NewLlmCall.runId`.
 */
export async function writeProfile(deps: StructuredDeps, prompt: Prompt, input: EntityProfileInput): Promise<StructuredResult<ProfileOutput>> {
  return callStructured(deps, {
    prompt,
    input: {
      "what this is": `${input.dossier.canonical} (a ${input.dossier.kind})`,
      ...input.dossier.sections,
      "general knowledge": input.allowGeneral
        ? "You may write a `general` section from what you know. Mark nothing in it as a fact about this mailbox."
        : "Leave `general` and `generalConfidence` null. Only what the dossier shows may be written.",
    },
    schema: profileSchema(input.dossier.kind),
    project: WORKER_PROJECT,
    runId: null,
  });
}
