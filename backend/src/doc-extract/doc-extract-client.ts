import { z } from "zod";

import { DocumentFormat } from "../contracts";

/**
 * The doc-extract service's contract, mirrored from services/doc-extract/models.py
 * by hand; change both or neither. Field names stay snake_case: this is its JSON.
 */

export const ExtractedPage = z.object({
  index: z.number().int(),
  text: z.string(),
  /** `image` is a page that carries no text layer, so its pixels are in `images`. */
  source: z.enum(["text_layer", "image", "none"]),
});
export type ExtractedPage = z.infer<typeof ExtractedPage>;

export const UnreadImage = z.object({
  index: z.number().int(),
  /** Where the PNG was written, under the request's `out_prefix`. */
  key: z.string(),
  /** A page of a PDF or a photographed document, or a picture inside a word or excel file. */
  origin: z.enum(["page", "embedded"]),
});
export type UnreadImage = z.infer<typeof UnreadImage>;

export const ExtractResponse = z.object({
  format: DocumentFormat,
  /** Pages joined with a form feed. */
  text: z.string(),
  pages: z.array(ExtractedPage),
  /**
   * Nobody could read this, a person included: empty, would not open, or nothing in
   * it to read or to look at. A legible scan is not unreadable; it is a document
   * nothing has read yet, and it arrives here with `images` instead of text.
   */
  unreadable: z.boolean(),
  /** Some of this document is pixels, so its text alone is not the whole of it. */
  has_images: z.boolean(),
  images: z.array(UnreadImage),
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
  /** Where pixels it could not read are written. Without it they are reported and not kept. */
  outPrefix?: string;
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
