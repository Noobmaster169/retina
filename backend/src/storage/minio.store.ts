import type { Readable } from "node:stream";

import { Client } from "minio";

import { config } from "../config";
import { RetryableError, TerminalError } from "../lib/errors";
import type { ObjectStore } from "./object-store";

const NOT_FOUND_CODES = new Set(["NotFound", "NoSuchKey"]);

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && NOT_FOUND_CODES.has(String(error.code));
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

class MinioStore implements ObjectStore {
  constructor(
    private readonly client: Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.putObject(this.bucket, key, body, body.length, { "Content-Type": contentType });
    } catch (error) {
      throw new RetryableError(`could not store ${key}`, { cause: error });
    }
  }

  async get(key: string): Promise<Buffer> {
    return readAll(await this.stream(key));
  }

  async stream(key: string): Promise<Readable> {
    try {
      return await this.client.getObject(this.bucket, key);
    } catch (error) {
      if (isNotFound(error)) throw new TerminalError(`no such object: ${key}`, { cause: error });
      throw new RetryableError(`could not read ${key}`, { cause: error });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw new RetryableError(`could not stat ${key}`, { cause: error });
    }
  }

  async ensureBucket(): Promise<void> {
    if (await this.client.bucketExists(this.bucket)) return;
    await this.client.makeBucket(this.bucket);
  }

  async ping(): Promise<void> {
    if (!(await this.client.bucketExists(this.bucket))) throw new Error(`bucket ${this.bucket} does not exist`);
  }
}

/** Throws when the credentials are not configured, which is how the api runs before phase 3. */
export function createMinioStore(): ObjectStore {
  if (!config.MINIO_ACCESS_KEY || !config.MINIO_SECRET_KEY) {
    throw new TerminalError("MINIO_ACCESS_KEY and MINIO_SECRET_KEY are not set");
  }
  const [host, port] = config.MINIO_ENDPOINT.split(":");
  const client = new Client({
    endPoint: host,
    port: port ? Number(port) : undefined,
    useSSL: config.MINIO_USE_SSL,
    accessKey: config.MINIO_ACCESS_KEY,
    secretKey: config.MINIO_SECRET_KEY,
  });
  return new MinioStore(client, config.MINIO_BUCKET);
}
