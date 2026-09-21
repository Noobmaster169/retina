import { TerminalError } from "../../lib/errors";
import type { AttachmentBytes, EmailRecord, Source } from "../source";

export class MemorySource implements Source {
  constructor(
    private readonly records: EmailRecord[],
    private readonly attachments: Map<string, Buffer> = new Map(),
  ) {}

  /** Adds one email after construction, for a test that makes its mail up as it goes. */
  put(record: EmailRecord, attachments: Map<string, Buffer> = new Map()): void {
    this.records.push(record);
    for (const [path, bytes] of attachments) this.attachments.set(path, bytes);
  }

  async listEmailIds(): Promise<string[]> {
    return this.records.map((record) => record.email_id).sort();
  }

  async getEmail(id: string): Promise<EmailRecord> {
    const record = this.records.find((candidate) => candidate.email_id === id);
    if (!record) throw new TerminalError(`no such email: ${id}`);
    return record;
  }

  async readAttachment(path: string): Promise<AttachmentBytes> {
    const bytes = this.attachments.get(path);
    if (!bytes) throw new TerminalError(`no such attachment: ${path}`);
    return { bytes, contentType: "text/plain" };
  }
}
