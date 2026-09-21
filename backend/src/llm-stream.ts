import { z } from "zod";

import type { ChatRequest, ChatResult } from "./llm-contract";
import { asLlmError, deadline, messageParams, proxyClient } from "./llm-wire";

/**
 * The proxy's final `message_delta` of a stream. `usage.cost_usd` and
 * `structured_output` are its extensions to the Anthropic wire: a stream's
 * headers go out before the cost is known, and with a schema the text deltas
 * are the model writing the JSON, a preview, while `structured_output` is the
 * answer the provider validated.
 */
const FinalDelta = z.object({
  type: z.literal("message_delta"),
  delta: z.object({ stop_reason: z.string().nullish() }).optional(),
  usage: z
    .object({ input_tokens: z.number().nullish(), output_tokens: z.number().nullish(), cost_usd: z.number().nullish() })
    .optional(),
  structured_output: z.unknown().optional(),
});

/** With a schema, each block is one attempt at the answer; a new one means the last failed validation. */
const BlockStart = z.object({ type: z.literal("content_block_start") });

const TextDelta = z.object({
  type: z.literal("content_block_delta"),
  delta: z.object({ type: z.literal("text_delta"), text: z.string() }),
});

/**
 * One call streamed from the proxy. `onText` receives the text so far after
 * every piece and is awaited, so a slow consumer slows the read rather than
 * piling up writes. The result is the same shape a blocking `chat` returns.
 *
 * `signal` abandons the call where it stands: the connection closes, and the
 * proxy kills the `claude -p` session it was reading from.
 */
export async function chatStream(
  project: string,
  req: ChatRequest,
  onText: (soFar: string) => Promise<void> | void,
  signal?: AbortSignal,
): Promise<ChatResult> {
  let text = "";
  let final: z.infer<typeof FinalDelta> | null = null;
  let model: string | null = null;
  try {
    const { data, response } = await proxyClient(project)
      .messages.create({ ...messageParams(req), stream: true }, { signal: deadline(signal) })
      .withResponse();
    model = response.headers.get("x-llm-proxy-model");
    for await (const event of data) {
      // A new attempt: the preview restarts rather than running two attempts together.
      if (BlockStart.safeParse(event).success && text) {
        text = "";
        continue;
      }
      const piece = TextDelta.safeParse(event);
      if (piece.success) {
        text += piece.data.delta.text;
        await onText(text);
        continue;
      }
      const end = FinalDelta.safeParse(event);
      if (end.success) final = end.data;
    }
  } catch (error) {
    throw asLlmError(error);
  }

  const structured = final?.structured_output;
  return {
    text: structured !== undefined ? JSON.stringify(structured) : text.trim(),
    model: model ?? req.model,
    stopReason: final?.delta?.stop_reason ?? null,
    usage: { inputTokens: final?.usage?.input_tokens ?? 0, outputTokens: final?.usage?.output_tokens ?? 0 },
    costUsd: final?.usage?.cost_usd ?? null,
  };
}
