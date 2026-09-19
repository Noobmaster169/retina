import { TerminalError } from "../../lib/errors";
import type { DocExtractClient, ExtractRequest, ExtractResponse, RenderRequest, RenderResponse } from "../doc-extract-client";

/** A readable, single-page answer with this text, as the service gives for a plain-text file. */
export function readable(text: string, format: ExtractResponse["format"] = "txt"): ExtractResponse {
  return {
    format,
    text,
    pages: [{ index: 1, text, source: "text_layer", ocr_confidence: null }],
    unreadable: false,
    scanned: false,
    warnings: [],
    bytes: Buffer.byteLength(text),
  };
}

/** What the service answers for a file that will not open, is empty, or has no text. */
export function unreadable(warning: string, format: ExtractResponse["format"] = "pdf"): ExtractResponse {
  return { format, text: "", pages: [], unreadable: true, scanned: false, warnings: [warning], bytes: 0 };
}

/** A page read by OCR: text present, `scanned` set, with the confidence tesseract reported. */
export function scanned(text: string, confidence = 88): ExtractResponse {
  return {
    format: "pdf",
    text,
    pages: [{ index: 1, text, source: "ocr", ocr_confidence: confidence }],
    unreadable: false,
    scanned: true,
    warnings: ["page 1: no text layer, read by OCR"],
    bytes: 20_000,
  };
}

/**
 * Answers from a map of object key to canned response, or to an Error to
 * throw, as the real client would. A key with no entry is a test mistake and
 * fails loudly. Every call is remembered.
 */
export class MemoryDocExtractClient implements DocExtractClient {
  readonly extractCalls: ExtractRequest[] = [];
  readonly renderCalls: RenderRequest[] = [];

  constructor(private readonly answers: Map<string, ExtractResponse | Error> = new Map()) {}

  /** Sets what `extract` answers for one object key. */
  on(key: string, answer: ExtractResponse | Error): this {
    this.answers.set(key, answer);
    return this;
  }

  async extract(request: ExtractRequest): Promise<ExtractResponse> {
    this.extractCalls.push(request);
    const answer = this.answers.get(request.key);
    if (answer === undefined) throw new TerminalError(`MemoryDocExtractClient has no answer for ${request.key}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }

  async render(request: RenderRequest): Promise<RenderResponse> {
    this.renderCalls.push(request);
    const answer = this.answers.get(request.key);
    // A file that will not open has no pages to draw, exactly as the service answers.
    if (answer === undefined || answer instanceof Error || answer.unreadable) return { pages: [] };
    return { pages: [{ index: 1, key: `${request.outPrefix}/1.png`, width: 850, height: 1202 }] };
  }
}
