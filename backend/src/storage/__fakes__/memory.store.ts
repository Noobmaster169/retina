import { Readable } from "node:stream";

import { TerminalError } from "../../lib/errors";
import type { ObjectStore } from "../object-store";

export class MemoryStore implements ObjectStore {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async get(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    if (!found) throw new TerminalError(`no such object: ${key}`);
    return found.body;
  }

  async stream(key: string): Promise<Readable> {
    return Readable.from(await this.get(key));
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async ensureBucket(): Promise<void> {}

  async ping(): Promise<void> {}
}
