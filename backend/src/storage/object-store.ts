import type { Readable } from "node:stream";

/** Blob storage. MinIO in every real environment, memory in tests. */
export interface ObjectStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  /** Creates the bucket when it is missing. Safe to call on every boot. */
  ensureBucket(): Promise<void>;
  /** Resolves when the store answers; rejects otherwise. For /health. */
  ping(): Promise<void>;
}
