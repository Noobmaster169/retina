import { describe, expect, it } from "vitest";

import { eventFrames, parseFrame } from "./sse";

/**
 * The frame reader, against the ways a stream actually arrives: split in the
 * middle of a frame, two frames in one chunk, and the keep-alive comments a
 * proxy inserts.
 */

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const seen = [];
  for await (const frame of eventFrames(stream)) seen.push(frame);
  return seen;
}

describe("parseFrame", () => {
  const cases: { name: string; frame: string; want: { event: string; data: string } | null }[] = [
    { name: "a named event", frame: 'event: progress\ndata: {"step":1}', want: { event: "progress", data: '{"step":1}' } },
    { name: "no name is a message", frame: "data: hello", want: { event: "message", data: "hello" } },
    { name: "no space after the colon", frame: "event:answer\ndata:{}", want: { event: "answer", data: "{}" } },
    { name: "only one space is stripped", frame: "data:  padded", want: { event: "message", data: " padded" } },
    { name: "several data lines join", frame: "data: one\ndata: two", want: { event: "message", data: "one\ntwo" } },
    { name: "a comment alone carries nothing", frame: ": keep alive", want: null },
    { name: "an event with no data carries nothing", frame: "event: progress", want: null },
    { name: "carriage returns are not part of the value", frame: "event: progress\r\ndata: x\r", want: { event: "progress", data: "x" } },
    { name: "an unknown field is ignored", frame: "id: 7\nevent: progress\ndata: x", want: { event: "progress", data: "x" } },
  ];

  for (const { name, frame, want } of cases) {
    it(name, () => {
      expect(parseFrame(frame)).toEqual(want);
    });
  }
});

describe("eventFrames", () => {
  it("reads two frames out of one chunk", async () => {
    const seen = await collect(streamOf("event: progress\ndata: 1\n\nevent: progress\ndata: 2\n\n"));
    expect(seen).toEqual([
      { event: "progress", data: "1" },
      { event: "progress", data: "2" },
    ]);
  });

  it("reads one frame split across chunks", async () => {
    const seen = await collect(streamOf("event: pro", "gress\nda", "ta: {\"step\"", ":1}\n\n"));
    expect(seen).toEqual([{ event: "progress", data: '{"step":1}' }]);
  });

  it("reads a last frame that has no blank line after it", async () => {
    const seen = await collect(streamOf("event: answer\ndata: done"));
    expect(seen).toEqual([{ event: "answer", data: "done" }]);
  });

  it("skips keep-alive comments between frames", async () => {
    const seen = await collect(streamOf(": warm\n\nevent: progress\ndata: 1\n\n: warm\n\n"));
    expect(seen).toEqual([{ event: "progress", data: "1" }]);
  });

  it("yields nothing for an empty body", async () => {
    expect(await collect(streamOf())).toEqual([]);
  });

  it("does not split a frame whose data contains a blank line's worth of newlines", async () => {
    // The writer escapes newlines into the JSON, so a single data line is all
    // there ever is. This is the guarantee the reader leans on, stated as a test.
    const payload = JSON.stringify({ answer: "one\n\ntwo" });
    const seen = await collect(streamOf(`event: progress\ndata: ${payload}\n\n`));
    expect(seen).toEqual([{ event: "progress", data: payload }]);
    expect(JSON.parse(seen[0].data).answer).toBe("one\n\ntwo");
  });
});
