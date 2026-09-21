import { z } from "zod";

import { type CallIds, WORKER_PROJECT } from "./classify";
import type { Prompt } from "./prompts/registry";
import { callStructured, type StructuredDeps, type StructuredResult } from "./structured";

/**
 * A document nothing could read as text, read by looking at it.
 *
 * It transcribes and never extracts. What comes back becomes the document's text
 * and goes through the same doc-type, extraction, evidence and judging path every
 * other document takes, so a value still carries the quote it was read from and
 * every improvement to those prompts reaches a scan for free. Asking this step for
 * the seven fields instead would be a second extractor to tune, and one whose
 * answers nothing could be checked against.
 */

export const VisionReadOutput = z.object({
  /** False only when the page cannot be worked from at all: blank, or too poor to make out. */
  legible: z.boolean(),
  /** The document as text, laid out as it is printed. Empty when `legible` is false. */
  text: z.string(),
  /** One sentence about the picture itself, where there is something to say. */
  note: z.string().max(300).nullable(),
});
export type VisionReadOutput = z.infer<typeof VisionReadOutput>;

export interface VisionReadInput {
  filename: string;
  /** The pages, in order. A multi-page fax or a PDF with several unread pages arrives whole. */
  images: { mediaType: string; base64: string }[];
}

/** One call per document, however many pages it has: they are one document and read as one. */
export async function readByLooking(
  deps: StructuredDeps,
  prompt: Prompt,
  input: VisionReadInput,
  ids: CallIds,
): Promise<StructuredResult<VisionReadOutput>> {
  return callStructured(deps, {
    prompt,
    input: {
      filename: input.filename,
      pages: String(input.images.length),
    },
    images: input.images,
    schema: VisionReadOutput,
    project: WORKER_PROJECT,
    ...ids,
  });
}
