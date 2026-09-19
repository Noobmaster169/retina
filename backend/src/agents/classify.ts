import { z } from "zod";

import { Category } from "../contracts";
import type { ClassifyInput } from "../pipeline/classify";
import type { Prompt } from "./prompts/registry";
import { callStructured, type StructuredDeps, type StructuredResult } from "./structured";

/**
 * The category is the organisers' enum, so the model cannot answer with one
 * that does not exist. The order is the order the model writes in: a
 * schema-bound answer has no room for prose before it, so the rationale comes
 * first and the category is decided after the reasoning, not before it.
 */
export const ClassifyOutput = z.object({
  rationale: z.string().max(600),
  category: Category,
  confidence: z.number().min(0).max(1),
});
export type ClassifyOutput = z.infer<typeof ClassifyOutput>;

export const WORKER_PROJECT = "worker";

export interface CallIds {
  runId: string;
  emailRunId: string;
}

/** The labelled sections every reader of an email sees, in this order. The attachments' text comes last, after the request. */
export function emailSections(input: ClassifyInput): Record<string, string | string[]> {
  const sections: Record<string, string | string[]> = {
    from: input.from,
    subject: input.subject,
    attachments: input.attachments,
    body: input.body,
  };
  if (input.attachmentContents !== undefined) sections["attachment contents"] = input.attachmentContents;
  return sections;
}

/** The generator: one zero-shot call that names the email's category. */
export async function classifyEmail(
  deps: StructuredDeps,
  prompt: Prompt,
  input: ClassifyInput,
  ids: CallIds,
): Promise<StructuredResult<ClassifyOutput>> {
  return callStructured(deps, { prompt, input: emailSections(input), schema: ClassifyOutput, project: WORKER_PROJECT, ...ids });
}
