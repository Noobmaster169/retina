import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import type { LlmClient, LlmRequest, LlmResponse } from "../llm-client";

const Recorded = z.object({
  text: z.string(),
  model: z.string().nullable(),
  stopReason: z.string().nullable(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  costUsd: z.number().nullable(),
  latencyMs: z.number(),
});

/** The fixture a request is filed under: the same model, system prompt and input give the same file. */
export function recordingKey(request: Pick<LlmRequest, "model" | "system" | "user">): string {
  return createHash("sha256").update(JSON.stringify([request.model, request.system, request.user])).digest("hex");
}

/**
 * Realistic answers without a proxy. In `record` mode it wraps a real client
 * and saves every answer under `dir`; in `replay` mode it answers from those
 * files and throws when one is missing, so a test never reaches the network by
 * accident. For the few integration tests that need what a model really says.
 */
export class RecordingLlmClient implements LlmClient {
  constructor(
    private readonly mode: "record" | "replay",
    private readonly dir: string,
    private readonly inner?: LlmClient,
  ) {
    if (mode === "record" && !inner) throw new Error("RecordingLlmClient needs a real client to record");
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const path = join(this.dir, `${recordingKey(request)}.json`);
    if (this.mode === "replay") {
      if (!existsSync(path)) throw new Error(`no recorded answer at ${path}: record it first`);
      return Recorded.parse(JSON.parse(readFileSync(path, "utf8")));
    }
    if (!this.inner) throw new Error("RecordingLlmClient needs a real client to record");
    const response = await this.inner.complete(request);
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(path, `${JSON.stringify(response, null, 2)}\n`);
    return response;
  }
}
