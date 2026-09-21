import { ChatAnswer, ChatProgress } from "@/lib/api/chat-thread-schemas";

import { eventFrames } from "./sse";

/**
 * One streamed turn, as the three things that can actually happen to it.
 *
 * This is the contract boundary: frames arrive as text and leave as values the
 * page can draw, or not at all. Every frame is parsed against the mirrored
 * schema for the reason every response is, so a backend that renames a field
 * fails here, naming it, instead of reaching a component as undefined.
 *
 * A `progress` frame that does not parse is dropped and the next one is taken.
 * It is a repaint of something about to be replaced, and losing one costs a
 * frame. An `answer` that does not parse is the turn, so it becomes a failure.
 */

export type TurnEvent =
  | { kind: "progress"; progress: ChatProgress }
  | { kind: "answer"; answer: ChatAnswer }
  | { kind: "failure"; message: string };

function body(data: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
}

export async function* turnEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<TurnEvent> {
  for await (const frame of eventFrames(stream)) {
    if (frame.event === "progress") {
      const parsed = ChatProgress.safeParse(body(frame.data));
      if (parsed.success) yield { kind: "progress", progress: parsed.data };
      continue;
    }

    if (frame.event === "answer") {
      const parsed = ChatAnswer.safeParse(body(frame.data));
      if (parsed.success) yield { kind: "answer", answer: parsed.data };
      else {
        yield {
          kind: "failure",
          message: "The answer arrived outside the contract. Reopen the conversation to read what was stored.",
        };
      }
      continue;
    }

    if (frame.event === "failure") {
      const said = body(frame.data) as { error?: unknown } | null;
      yield { kind: "failure", message: typeof said?.error === "string" ? said.error : "The answer did not arrive." };
    }
  }
}
