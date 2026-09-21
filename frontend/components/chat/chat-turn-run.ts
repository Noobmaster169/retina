import { mergeTurns } from "./merge-turns";
import { openConversation, refusal } from "./conversation";
import { whatLanded } from "./pending-turn";
import { turnEvents } from "./turn-stream";
import type { AskOptions, Wiring } from "./chat-live";

/**
 * One turn, start to finish.
 *
 * Outside the provider because it outlives whatever asked for it: the person
 * navigates, the component that called `ask` is unmounted, and this keeps
 * writing into the store until the answer lands. A failure becomes a message
 * beside the question rather than a thrown error, because a conversation
 * somebody is in the middle of must not be lost to one bad request.
 */
export async function run(options: AskOptions, wiring: Wiring): Promise<void> {
  const { question, actor, skills, context, openWith } = options;
  const { change, rename, inFlight } = wiring;
  let key = options.key;
  const control = new AbortController();
  inFlight.current[key] = control;
  let conversation: string | null = null;

  try {
    let id = options.conversationId;
    if (!id) {
      if (!openWith) {
        change(key, (was) => ({ ...was, error: "There is no conversation to ask in." }));
        return;
      }
      const start = await openConversation(openWith);
      if (!start.ok) {
        change(key, (was) => ({ ...was, error: start.message }));
        return;
      }
      id = start.conversation.id;
      // Everything asked in the draft bucket belongs to this conversation now,
      // including the request still running against it.
      rename(key, id);
      key = id;
      options.onOpened?.(id);
    }
    conversation = id;

    const response = await fetch(`/api/chat/${id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ content: question, actor, skills, context }),
      signal: control.signal,
    });
    if (!response.ok) {
      const message = await refusal(response);
      change(key, (was) => ({ ...was, error: message }));
      return;
    }
    if (!response.body) {
      change(key, (was) => ({ ...was, error: "The answer came back with no body." }));
      return;
    }

    let ended = false;
    for await (const event of turnEvents(response.body)) {
      if (event.kind === "progress") {
        change(key, (was) => ({ ...was, progress: event.progress }));
        continue;
      }
      if (event.kind === "calls") {
        change(key, (was) => ({ ...was, calls: [...was.calls, ...event.calls] }));
        continue;
      }
      ended = true;
      if (event.kind === "answer") {
        // The turn and the end of the wait are set together, in one render.
        // Apart, the finished answer is drawn under the half-written one for a
        // frame and the thread reads as if it answered twice.
        change(key, (was) => ({
          ...was,
          turns: [...was.turns, event.answer.turn],
          exhausted: event.answer.exhausted,
          progress: null,
          calls: [],
          pending: false,
        }));
        continue;
      }
      change(key, (was) => ({ ...was, error: event.message }));
    }
    if (!ended) {
      change(key, (was) => ({
        ...was,
        error: "The answer stopped arriving. Reopen the conversation to see what was stored.",
      }));
    }
  } catch (cause) {
    // An abort is the person pressing Stop, not a failure. The backend has
    // stored what the turn found; this is the reading of it.
    if (cause instanceof DOMException && cause.name === "AbortError") {
      const landed = conversation ? await whatLanded(conversation, 0) : [];
      change(key, (was) =>
        landed.length > 0
          ? { ...was, turns: mergeTurns(was.turns, landed) }
          : { ...was, error: "Stopped. Anything it had found is kept with the conversation; reopen it to see." },
      );
      return;
    }
    change(key, (was) => ({ ...was, error: cause instanceof Error ? cause.message : "The answer did not arrive." }));
  } finally {
    delete inFlight.current[key];
    change(key, (was) => ({ ...was, progress: null, calls: [], pending: false }));
  }
}
