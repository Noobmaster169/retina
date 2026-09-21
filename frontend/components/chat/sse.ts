/**
 * Reading server-sent events off a fetch body.
 *
 * `EventSource` would be the obvious tool and cannot be used: it only ever
 * issues a GET, and asking a question is a POST with a body. So the frames are
 * read off the response stream by hand, which is a small amount of parsing
 * with one rule worth stating: a frame ends at a blank line, and a chunk from
 * the network is not a frame. Two frames can arrive in one chunk and one frame
 * can be split across three, so the buffer is what is parsed and never the
 * chunk.
 */

export interface ServerEvent {
  /** The event name. Frames that name none are `message`, as the format says. */
  event: string;
  /** The `data:` lines, joined with newlines and left as text. */
  data: string;
}

/** One frame, without its terminating blank line. Null for a frame carrying no data, such as a comment or a keep-alive. */
export function parseFrame(frame: string): ServerEvent | null {
  let event = "message";
  const data: string[] = [];

  for (const raw of frame.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    // A line opening with a colon is a comment, which is how a stream stays
    // warm through a proxy that would otherwise time it out.
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }

  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

/**
 * The frames of a response body, in order, as they arrive.
 *
 * The reader is released when the loop is left, however it is left, so a caller
 * that stops early or throws does not leave the connection held open.
 */
export async function* eventFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
        const frame = parseFrame(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (frame) yield frame;
      }
    }
    // A last frame with no blank line after it, which is what a server that
    // ends the response immediately after writing leaves behind.
    const last = parseFrame(buffer);
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}
