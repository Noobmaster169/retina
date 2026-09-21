import { type ChatTurn } from "@/lib/api/chat-agent-schemas";

/**
 * What a conversation holds, when the server's copy and this session's copy
 * disagree.
 *
 * They disagree often and for one good reason: a turn costs real model calls,
 * so the answer that arrives over the stream is kept here rather than refetched
 * and a server render taken a moment earlier does not have it yet. Replacing
 * what is held with what the server last said would throw that answer away,
 * which is what made an answer vanish on navigating away and come back on a
 * reload.
 *
 * The rule: the server is right about everything it has, this session keeps
 * what the server has not caught up with, and the question drawn before it was
 * stored gives way to the stored one.
 *
 * Pure: two lists in, one list out.
 */
export function mergeTurns(server: ChatTurn[], local: ChatTurn[]): ChatTurn[] {
  if (local.length === 0) return server;
  if (server.length === 0) return local;

  const known = new Set(server.map((turn) => turn.id));
  const newest = server.reduce((highest, turn) => Math.max(highest, turn.id), 0);
  // A question drawn the moment it was asked carries a negative id until the
  // server hands back its real one. Anything above the newest stored id landed
  // here after the render was taken.
  const asked = new Set(server.filter((turn) => turn.role === "user").map((turn) => turn.content));

  const ahead = local.filter((turn) => {
    if (known.has(turn.id)) return false;
    if (turn.id < 0) return !asked.has(turn.content);
    return turn.id > newest;
  });
  // Server first and the rest after: the server's are oldest first, and
  // everything kept is by definition newer than all of them.
  return [...server, ...ahead];
}
