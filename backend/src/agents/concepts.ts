import { z } from "zod";

import type { EntityKind } from "../contracts";
import type { JudgeSubject } from "../pipeline/ontology";
import { WORKER_PROJECT } from "./classify";
import type { Prompt } from "./prompts/registry";
import { callStructured, type StructuredDeps, type StructuredResult } from "./structured";

/**
 * A term written nowhere in the database, given a meaning and then applied.
 *
 * Two steps and not one. Defining is once per phrase and its answer is shown
 * to the reader, so a disagreement about what "Asia" covers surfaces in the
 * answer instead of in the numbers. Judging is once per batch of things and is
 * the part that scales, so it never rewrites the definition: every thing under
 * one concept is judged against the same words.
 *
 * Neither belongs to a run: a concept is about the things, not about one
 * replay of the inbox.
 */

export const ConceptDefinition = z.object({
  /** An existing concept this phrase means the same as, or null for a new one. */
  sameAs: z.string().regex(/^\d+$/).nullable(),
  /** One paragraph a second reader could apply. Shown to the person who asked. */
  definition: z.string().min(20).max(800),
  /** Words a matching profile would likely contain. They rank; they never decide. */
  searchTerms: z.array(z.string().min(2).max(40)).max(12),
});
export type ConceptDefinition = z.infer<typeof ConceptDefinition>;

export interface DefineInput {
  phrase: string;
  kind: EntityKind;
  /** Concepts already defined whose phrase is near this one. */
  existing: { id: string; phrase: string; definition: string }[];
}

export async function defineConcept(deps: StructuredDeps, prompt: Prompt, input: DefineInput): Promise<StructuredResult<ConceptDefinition>> {
  return callStructured(deps, {
    prompt,
    input: {
      "the phrase": input.phrase,
      "the kind of thing it describes": input.kind,
      "concepts already defined": input.existing.map((concept) => `[${concept.id}] "${concept.phrase}": ${concept.definition}`),
    },
    schema: ConceptDefinition,
    project: WORKER_PROJECT,
    runId: null,
  });
}

const Verdict = z.object({
  rationale: z.string().max(240),
  verdict: z.enum(["yes", "no", "unknown"]),
  confidence: z.number().min(0).max(1),
});
export type ConceptVerdict = z.infer<typeof Verdict>;

/**
 * Exactly the ids sent, each required, the same way the field judge's schema
 * is built: the model can neither skip a thing nor answer for one it was not
 * given.
 */
export function judgeSchema(ids: number[]): z.ZodType<Record<string, ConceptVerdict>> {
  return z.object(Object.fromEntries(ids.map((id) => [String(id), Verdict])));
}

export interface JudgeInput {
  definition: string;
  kind: EntityKind;
  subjects: JudgeSubject[];
}

function render(subject: JudgeSubject): string {
  const attributes = Object.entries(subject.attributes)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  return [
    `[${subject.id}] ${subject.name}`,
    attributes ? `  ${attributes}` : "",
    `  ${subject.summary}`,
    subject.observed ? `  our mail: ${subject.observed}` : "",
    subject.general ? `  general knowledge, unverified: ${subject.general}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function judgeConcept(
  deps: StructuredDeps,
  prompt: Prompt,
  input: JudgeInput,
): Promise<StructuredResult<Record<string, ConceptVerdict>>> {
  return callStructured(deps, {
    prompt,
    input: {
      "the definition": input.definition,
      "the kind of thing": input.kind,
      things: input.subjects.map(render),
    },
    schema: judgeSchema(input.subjects.map((subject) => subject.id)),
    project: WORKER_PROJECT,
    runId: null,
  });
}
