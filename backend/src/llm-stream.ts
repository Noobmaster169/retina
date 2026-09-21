import { z } from "zod";

import type { ChatRequest, ChatResult } from "./llm-contract";
import { asLlmError, messageParams, proxyClient, REQUEST_TIMEOUT_MS } from "./llm-wire";
import { childLogger } from "./lib/logger";

const log = childLogger({ module: "llm-stream" });

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

/**
 * A block boundary. With a schema `claude -p` writes the object across more
 * than one block, the last of which is the one `structured_output` comes from,
 * so `text` follows the last block and not their concatenation.
 */
const BlockStart = z.object({ type: z.literal("content_block_start"), index: z.number().nullish() });

const TextDelta = z.object({
  type: z.literal("content_block_delta"),
  delta: z.object({ type: z.literal("text_delta"), text: z.string() }),
});

/**
 * One call streamed from the proxy. `onText` receives the text so far after
 * every piece and is awaited, so a slow consumer slows the read rather than
 * piling up writes. The result is the same shape a blocking `chat` returns.
 */
export async function chatStream(
  project: string,
  req: ChatRequest,
  onText: (soFar: string) => Promise<void> | void,
): Promise<ChatResult> {
  let text = "";
  let final: z.infer<typeof FinalDelta> | null = null;
  let model: string | null = null;
  try {
    const { data, response } = await proxyClient(project)
      .messages.create({ ...messageParams(req), stream: true }, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      .withResponse();
    model = response.headers.get("x-llm-proxy-model");
    for await (const event of data) {
      // A second content block, which `claude -p` sends with a schema: it
      // writes the object once, then writes it again as the block the
      // validated answer comes from. `text` follows the last block, because
      // that is the one `structured_output` corresponds to and the one this
      // falls back to when there is no structured output at all.
      //
      // The preview a caller is watching must not follow it backwards. That is
      // the caller's to handle, and the chat loop does it by only ever moving
      // its preview forward; there is nothing to do here but say so.
      const started = BlockStart.safeParse(event);
      if (started.success && text) {
        log.debug({ model: req.model, blockIndex: started.data.index ?? null, chars: text.length }, "a streamed answer began a second block");
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
