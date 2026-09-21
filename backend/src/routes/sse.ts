import type { Response } from "express";

/**
 * Server-sent events, as much of them as this API needs.
 *
 * One direction, named events, JSON bodies. There is no reconnection and no
 * event id: every stream here belongs to one request that is doing work, and a
 * client that lost the connection has lost the work, not its place in a log.
 *
 * The status code is spent the moment the headers go out, which is before the
 * work has had a chance to fail. A failure after that point is an event with a
 * name, not a status, and the caller is the one that decides which name.
 */
export interface EventStream {
  /** One named event. Ignored once the stream is closed, so a late write is not a crash. */
  send(event: string, data: unknown): void;
  end(): void;
}

/** Whether the caller asked for a stream rather than one JSON body. */
export function wantsStream(accept: string | undefined): boolean {
  return (accept ?? "").includes("text/event-stream");
}

export function eventStream(res: Response): EventStream {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    // Both nginx and the ngrok tunnel in front of this buffer a response body
    // by default, which holds every event until the stream closes and turns a
    // stream back into exactly the wait it was built to remove.
    "x-accel-buffering": "no",
  });
  res.flushHeaders();

  let open = true;
  return {
    send(event, data) {
      if (!open) return;
      // JSON.stringify escapes newlines, so the body is always one `data:` line
      // and never needs splitting across several.
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      if (!open) return;
      open = false;
      res.end();
    },
  };
}
