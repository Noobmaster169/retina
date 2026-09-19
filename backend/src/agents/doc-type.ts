import { z } from "zod";

import { type AttachmentRole, DocType } from "../contracts";
import { type CallIds, WORKER_PROJECT } from "./classify";
import type { Prompt } from "./prompts/registry";
import { callStructured, type StructuredDeps, type StructuredResult } from "./structured";

export const DocTypeOutput = z.object({
  rationale: z.string().max(600),
  doc_type: DocType,
  confidence: z.number().min(0).max(1),
});
export type DocTypeOutput = z.infer<typeof DocTypeOutput>;

export interface DocTypeInput {
  filename: string;
  /** What the filename claims, handed to the model as a claim to check. */
  role: AttachmentRole;
  /** The extracted text, already cut to the cap. */
  text: string;
}

const CLAIM: Record<AttachmentRole, string> = {
  SI: "the file name says it is a Shipping Instruction",
  BL: "the file name says it is a Bill of Lading",
  UNKNOWN: "the file name does not say what it is",
};

/** What kind of document one attachment is, from its text. There is no title table in code: the model reads it. */
export async function identifyDocument(
  deps: StructuredDeps,
  prompt: Prompt,
  input: DocTypeInput,
  ids: CallIds,
): Promise<StructuredResult<DocTypeOutput>> {
  return callStructured(deps, {
    prompt,
    input: { file: input.filename, claim: CLAIM[input.role], text: input.text },
    schema: DocTypeOutput,
    project: WORKER_PROJECT,
    ...ids,
  });
}
