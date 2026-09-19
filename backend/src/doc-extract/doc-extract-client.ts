import { z } from "zod";

import { DocumentFormat } from "../contracts";

/**
 * The doc-extract service's contract, mirrored from services/doc-extract/models.py
 * by hand; change both or neither. Field names stay snake_case: this is its JSON.
 */

export const ExtractedPage = z.object({
  index: z.number().int(),
  text: z.string(),
  source: z.enum(["text_layer", "ocr", "none"]),
  ocr_confidence: z.number().nullable(),
});
export type ExtractedPage = z.infer<typeof ExtractedPage>;

export const ExtractResponse = z.object({
  format: DocumentFormat,
  /** Pages joined with a form feed. */
  text: z.string(),
  pages: z.array(ExtractedPage),
  /** Empty, would not open, no text even after OCR: a fact from the parser, not a judgement. */
  unreadable: z.boolean(),
  /** Any page was read by OCR. */
  scanned: z.boolean(),
  warnings: z.array(z.string()),
  bytes: z.number().int(),
});
export type ExtractResponse = z.infer<typeof ExtractResponse>;

export const RenderResponse = z.object({
  pages: z.array(z.object({ index: z.number().int(), key: z.string(), width: z.number().int(), height: z.number().int() })),
});
export type RenderResponse = z.infer<typeof RenderResponse>;

export interface ExtractRequest {
  /** The attachment's object key in the bucket. The service reads it from there; bytes never pass through here. */
  key: string;
  filename: string;
  contentType?: string;
}

export interface RenderRequest {
  key: string;
  filename: string;
  /** Page images land under this prefix, one `{n}.png` each. */
  outPrefix: string;
  dpi?: number;
}

/** Every parse in the pipeline goes through this. Tests hand in the memory fake; nothing in a test reaches the service. */
export interface DocExtractClient {
  extract(request: ExtractRequest): Promise<ExtractResponse>;
  render(request: RenderRequest): Promise<RenderResponse>;
}
