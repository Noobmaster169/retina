import { basename, extname } from "node:path/posix";

import { z } from "zod";

import { RetryableError, TerminalError } from "../lib/errors";
import { type AttachmentBytes, EmailRecord, type Source } from "./source";

const TIMEOUT_MS = 15_000;

const CONTENT_TYPES: Record<string, string> = {
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** The server answers octet-stream for everything it does not know, which says nothing. */
function contentTypeOf(path: string, header: string | null): string {
  const fromHeader = header?.split(";")[0].trim();
  if (fromHeader && fromHeader !== "application/octet-stream") return fromHeader;
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** The Averis kit's FastAPI server: GET /emails, /emails/{id}, /attachments/{name}. */
export class AverisSource implements Source {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async fetch(path: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new RetryableError(`inbox unreachable for ${path}`, { cause: error });
    }
    if (response.status === 404) throw new TerminalError(`inbox has no ${path}`);
    if (!response.ok) throw new RetryableError(`inbox returned ${response.status} for ${path}`);
    return response;
  }

  async listEmailIds(): Promise<string[]> {
    const response = await this.fetch("/emails");
    const records = z.array(EmailRecord.pick({ email_id: true })).safeParse(await response.json());
    if (!records.success) throw new TerminalError("inbox /emails is not a list of emails", { cause: records.error });
    return records.data.map((record) => record.email_id).sort();
  }

  async getEmail(id: string): Promise<EmailRecord> {
    const response = await this.fetch(`/emails/${encodeURIComponent(id)}`);
    const record = EmailRecord.safeParse(await response.json());
    if (!record.success) throw new TerminalError(`inbox email ${id} has an unexpected shape`, { cause: record.error });
    return record.data;
  }

  async readAttachment(path: string): Promise<AttachmentBytes> {
    const response = await this.fetch(`/attachments/${encodeURIComponent(basename(path))}`);
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: contentTypeOf(path, response.headers.get("content-type")),
    };
  }
}
