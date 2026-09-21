import { describe, expect, it } from "vitest";

import { type TurnEvent, turnEvents } from "./turn-stream";

/**
 * The stream's contract boundary. What matters here is what happens to a frame
 * that does not parse, which is different for each kind: a lost progress frame
 * is a lost repaint, and a lost answer is the turn.
 */

function streamOf(...frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<TurnEvent[]> {
  const seen: TurnEvent[] = [];
  for await (const event of turnEvents(stream)) seen.push(event);
  return seen;
}

const progress = { step: 1, phase: "writing", reading: "r", answer: "Run 9e8efb9c has 20 emails.", tools: [] };

describe("turnEvents", () => {
  it("passes a progress frame through as a value", async () => {
    const seen = await collect(streamOf(frame("progress", progress)));
    expect(seen).toEqual([{ kind: "progress", progress }]);
  });

  it("drops a progress frame that does not parse and keeps reading", async () => {
    const seen = await collect(
      streamOf(frame("progress", { step: "one", phase: "writing" }), frame("progress", progress)),
    );
    expect(seen).toEqual([{ kind: "progress", progress }]);
  });

  it("drops a progress frame that is not JSON at all", async () => {
    const seen = await collect(streamOf("event: progress\ndata: {not json\n\n", frame("progress", progress)));
    expect(seen).toEqual([{ kind: "progress", progress }]);
  });

  it("turns an answer that does not parse into a failure, because it is the turn", async () => {
    const seen = await collect(streamOf(frame("answer", { turn: { id: 1 }, exhausted: false })));
    expect(seen).toHaveLength(1);
    expect(seen[0].kind).toBe("failure");
  });

  it("carries the backend's own message on a failure frame", async () => {
    const seen = await collect(streamOf(frame("failure", { error: "llm-proxy unreachable" })));
    expect(seen).toEqual([{ kind: "failure", message: "llm-proxy unreachable" }]);
  });

  it("names a failure itself when the frame says nothing useful", async () => {
    const seen = await collect(streamOf(frame("failure", {})));
    expect(seen).toEqual([{ kind: "failure", message: "The answer did not arrive." }]);
  });

  it("passes a step's finished calls through", async () => {
    const call = {
      tool: "run_recipe",
      args: { name: "run_overview" },
      thought: "The run's own counts.",
      ok: true,
      preview: "1 row",
      sql: "select count(*) from core.emails",
      result: null,
      durationMs: 19,
      recipe: { name: "run_overview", version: 1, skill: "pick-the-run", params: {} },
    };
    const seen = await collect(streamOf(frame("step", { calls: [call] })));
    expect(seen).toEqual([{ kind: "calls", calls: [call] }]);
  });

  it("drops a step frame that does not parse, since the answer carries the calls again", async () => {
    const seen = await collect(streamOf(frame("step", { calls: [{ tool: "run_sql" }] }), frame("progress", progress)));
    expect(seen).toEqual([{ kind: "progress", progress }]);
  });

  it("ignores an event name it does not know", async () => {
    const seen = await collect(streamOf(frame("heartbeat", {}), frame("progress", progress)));
    expect(seen).toEqual([{ kind: "progress", progress }]);
  });
});
