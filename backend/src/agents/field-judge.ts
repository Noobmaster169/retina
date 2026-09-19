import { z } from "zod";

import type { ComparisonField } from "../contracts";
import type { ExtractedFields, Judgement } from "../pipeline/compare";
import { type CallIds, WORKER_PROJECT } from "./classify";
import type { Prompt } from "./prompts/registry";
import { callStructured, type StructuredDeps, type StructuredResult } from "./structured";

/** Rationale first, so the answer is decided after the reasoning and not before it. */
const JudgementOut = z.object({
  rationale: z.string().max(300),
  same: z.boolean(),
  missing: z.boolean(),
  confidence: z.number().min(0).max(1),
});

// The pipeline's shape and the model's answer are one and the same; this line fails to compile if they drift.
const _shape: Judgement = {} as z.infer<typeof JudgementOut>;
void _shape;

export type JudgeOutput = Partial<Record<ComparisonField, Judgement>>;

/** Exactly the fields asked about, each required: the model cannot answer for a field it was not given, nor skip one. */
function judgeSchema(fields: ComparisonField[]): z.ZodType<JudgeOutput> {
  return z.object(Object.fromEntries(fields.map((field) => [field, JudgementOut])));
}

export interface JudgeInput {
  si: ExtractedFields;
  bl: ExtractedFields;
  /** The fields with a value on both sides. */
  fields: ComparisonField[];
}

function side(name: "SI" | "BL", fields: ExtractedFields, field: ComparisonField): string[] {
  const value = fields[field];
  return [`${name} value: ${value.value ?? "(none)"}`, `${name} quoted from: ${value.source_quote ?? "(no line quoted)"}`];
}

/** Whether each field's two values denote the same thing. One call per pair; the model sees every field it is asked about. */
export async function judgeFields(deps: StructuredDeps, prompt: Prompt, input: JudgeInput, ids: CallIds): Promise<StructuredResult<JudgeOutput>> {
  const sections = Object.fromEntries(input.fields.map((field) => [field, [...side("SI", input.si, field), ...side("BL", input.bl, field)]]));
  return callStructured(deps, { prompt, input: sections, schema: judgeSchema(input.fields), project: WORKER_PROJECT, ...ids });
}
