import { z } from "zod";

import { ComparisonField, type DocumentFormat } from "../contracts";
import type { Doubt, ExtractedFields } from "../pipeline/compare";
import { type CallIds, WORKER_PROJECT } from "./classify";
import type { Prompt } from "./prompts/registry";
import { callStructured, type StructuredDeps, type StructuredResult } from "./structured";

const FieldOut = z.object({
  value: z.string().nullable(),
  placeholder: z.string().nullable(),
  source_quote: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  note: z.string().max(200).nullable(),
});

/** The seven fields, verbatim, each with the line it was read from. The names are the organisers' enum. */
export const ExtractOutput = z.object(Object.fromEntries(ComparisonField.options.map((field) => [field, FieldOut])) as Record<ComparisonField, typeof FieldOut>);
export type ExtractOutput = z.infer<typeof ExtractOutput>;

// The pipeline's shape and the model's answer are one and the same; this line fails to compile if they drift.
const _shape: ExtractedFields = {} as ExtractOutput;
void _shape;

export type ExtractionRole = "SI" | "BL";

const DOCUMENT: Record<ExtractionRole, string> = {
  SI: "a Shipping Instruction, the shipper's instruction to the carrier",
  BL: "a draft Bill of Lading, the carrier's document drawn up from the instruction",
};

export interface ExtractInput {
  role: ExtractionRole;
  format: DocumentFormat;
  /** The extracted text, already cut to the cap. */
  text: string;
}

/** The seven fields of one document, as the model reads them. There is no label table in code: the model reads it. */
export async function extractFields(deps: StructuredDeps, prompt: Prompt, input: ExtractInput, ids: CallIds): Promise<StructuredResult<ExtractOutput>> {
  return callStructured(deps, {
    prompt,
    input: { document: DOCUMENT[input.role], format: input.format, text: input.text },
    schema: ExtractOutput,
    project: WORKER_PROJECT,
    ...ids,
  });
}

export interface VerifyExtractionInput extends ExtractInput {
  first: ExtractOutput;
  doubts: Doubt[];
}

const DOUBT: Record<Doubt["reason"], string> = {
  no_quote: "no line was quoted as evidence",
  quote_not_found: "the quoted line is not in the document",
  value_not_in_quote: "the value is not inside the quoted line",
  low_confidence: "the first reading was unsure of it",
};

/** A second reading of the fields whose evidence failed or whose confidence was low. Returns all seven. */
export async function verifyExtraction(
  deps: StructuredDeps,
  prompt: Prompt,
  input: VerifyExtractionInput,
  ids: CallIds,
): Promise<StructuredResult<ExtractOutput>> {
  return callStructured(deps, {
    prompt,
    input: {
      document: DOCUMENT[input.role],
      format: input.format,
      text: input.text,
      "first reading": JSON.stringify(input.first, null, 2),
      "in doubt": input.doubts.map((doubt) => `${doubt.field}: ${DOUBT[doubt.reason]}`),
    },
    schema: ExtractOutput,
    project: WORKER_PROJECT,
    ...ids,
  });
}
