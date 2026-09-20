import { z } from "zod";

import type { EntityKind } from "../contracts";
import { type CallIds, WORKER_PROJECT } from "./classify";
import type { Prompt } from "./prompts/registry";
import { callStructured, type StructuredDeps, type StructuredResult } from "./structured";

/**
 * Whether a spelling nobody has judged denotes a thing we already hold.
 *
 * The second of the two judges that may join two spellings. The field judge
 * compares two values side by side on a pair of documents; this one is given a
 * spelling and the things whose names are near it, and says which, if any, it
 * denotes. Both are model judgements, which is what keeps `resolve.ts` free of
 * the lowercasing, edit distance and lookup tables CLAUDE.md bans.
 */

export const EntityResolveOutput = z.object({
  /** Reasoning first, so the answer follows it rather than the other way round. */
  rationale: z.string().max(300),
  /** The id of the thing it denotes, as a string, or null when it is something new. */
  sameAs: z.string().regex(/^\d+$/).nullable(),
  /** The candidates are of more than one kind and the text does not say which. Stored on the sighting and shown. */
  ambiguous: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type EntityResolveOutput = z.infer<typeof EntityResolveOutput>;

export interface ResolveCandidate {
  id: string;
  kind: EntityKind;
  canonical: string;
  /** Every spelling this thing is written under. */
  spellings: string[];
  /** The addresses it has been seen with, where the mail carried any. */
  addresses: string[];
  /** The first two sentences of its profile, where it has one. */
  summary: string | null;
}

export interface EntityResolveInput {
  kind: EntityKind;
  surface: string;
  /** The address the mail carried under this name, where it carried one. */
  address: string | null;
  /** Where in the shipment it was read: a consignee, a carrier, the person who signed. */
  role: string;
  candidates: ResolveCandidate[];
}

function render(candidate: ResolveCandidate): string {
  const parts = [`[${candidate.id}] ${candidate.canonical} (${candidate.kind})`, `written: ${candidate.spellings.join(" | ")}`];
  if (candidate.addresses.length > 0) parts.push(`seen at: ${candidate.addresses.join(" | ")}`);
  if (candidate.summary) parts.push(candidate.summary);
  return parts.join("\n  ");
}

/** One call per spelling no stored name already covers. Returns an id or null; it never guesses silently. */
export async function resolveSighting(
  deps: StructuredDeps,
  prompt: Prompt,
  input: EntityResolveInput,
  ids: CallIds,
): Promise<StructuredResult<EntityResolveOutput>> {
  return callStructured(deps, {
    prompt,
    input: {
      "the spelling": input.surface,
      "read as": `${input.role} (a ${input.kind})`,
      "address given with it": input.address ?? "(none)",
      candidates: input.candidates.map(render),
    },
    schema: EntityResolveOutput,
    project: WORKER_PROJECT,
    ...ids,
  });
}
