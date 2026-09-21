import request from "supertest";
import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import { testApp } from "../app";

/**
 * The routes with a scripted model. Nothing here reaches the proxy, and the
 * conversations these create are left in the test database on purpose: an
 * HTTP test cannot share the caller's transaction, and a conversation is
 * cheap. Each one asserts on its own id rather than on a count.
 */

const KEY = "test-frontend-key";

function app(replies: string | string[] = "{}") {
  return testApp({ llm: new FakeLlmClient(replies) });
}

function step(value: unknown): string {
  return JSON.stringify(value);
}

async function newConversation(server: ReturnType<typeof app>, body: Record<string, unknown> = {}) {
  const response = await request(server)
    .post("/chat/conversations")
    .set("Authorization", `Bearer ${KEY}`)
    .send({ actor: "kai", ...body });
  return response;
}

describe("POST /chat/conversations", () => {
  it("opens one and names the scope it can see", async () => {
    const response = await newConversation(app(), { title: "About the inbox" });
    expect(response.status).toBe(201);
    expect(response.body.title).toBe("About the inbox");
    expect(response.body.scope).toEqual({ runId: null, emailId: null, chips: [{ label: "every run", memory: false }] });
  });

  it("refuses a body with no actor", async () => {
    const response = await request(app()).post("/chat/conversations").set("Authorization", `Bearer ${KEY}`).send({});
    expect(response.status).toBe(400);
  });
});

describe("POST /chat/:id/messages", () => {
  it("answers, stores the turn, and reports the SQL that ran", async () => {
    const server = app([
      step({
        action: "tool",
        reading: "One number.",
        calls: [{ tool: "run_sql", args: { sql: "select 7 as n", purpose: "reading a number" }, thought: "I need the number." }],
      }),
      step({ action: "final", answer: "It is 7.", sql_used: [] }),
    ]);
    const { body: conversation } = await newConversation(server);

    const answered = await request(server)
      .post(`/chat/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${KEY}`)
      .send({ content: "what is the number?", actor: "kai" });

    expect(answered.status).toBe(200);
    expect(answered.body.turn.content).toBe("It is 7.");
    expect(answered.body.turn.sqlUsed).toEqual(["select 7 as n limit 200"]);
    expect(answered.body.turn.toolCalls[0].result.rows).toEqual([["7"]]);
    expect(answered.body.exhausted).toBe(false);
    // Nothing in phase 10 may write, so no turn proposes an action yet.
    expect(answered.body.turn.proposal).toBeNull();

    const thread = await request(server).get(`/chat/${conversation.id}`).set("Authorization", `Bearer ${KEY}`);
    expect(thread.status).toBe(200);
    expect(thread.body.turns.map((turn: { role: string }) => turn.role)).toEqual(["user", "assistant"]);
    // The question names an untitled conversation, so it can be found again,
    // trimmed to a label by agents/chat/title.ts: the rail shows a column of
    // these and a column of cut sentences is not a column anyone can read.
    expect(thread.body.conversation.title).toBe("what is the number");
  });

  it("keeps the person's words even when the model never answers", async () => {
    // One reply repeats, so the loop spends its budget and returns exhausted.
    const server = app(step({ action: "tool", calls: [{ tool: "run_sql", args: { sql: "select 1", purpose: "again" }, thought: "Again." }] }));
    const { body: conversation } = await newConversation(server);

    const answered = await request(server)
      .post(`/chat/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${KEY}`)
      .send({ content: "a question with no end", actor: "kai" });

    expect(answered.status).toBe(200);
    expect(answered.body.exhausted).toBe(true);

    const thread = await request(server).get(`/chat/${conversation.id}`).set("Authorization", `Bearer ${KEY}`);
    expect(thread.body.turns[0].content).toBe("a question with no end");
  });

  it("404s an unknown conversation and 400s a malformed id", async () => {
    const server = app();
    const missing = await request(server)
      .post("/chat/11111111-1111-4111-8111-111111111111/messages")
      .set("Authorization", `Bearer ${KEY}`)
      .send({ content: "hello", actor: "kai" });
    expect(missing.status).toBe(404);

    const bad = await request(server).get("/chat/not-a-uuid").set("Authorization", `Bearer ${KEY}`);
    expect(bad.status).toBe(400);
  });
});

describe("DELETE /chat/:id", () => {
  it("removes a conversation and its turns", async () => {
    const server = app();
    const { body: conversation } = await newConversation(server);

    const removed = await request(server).delete(`/chat/${conversation.id}`).set("Authorization", `Bearer ${KEY}`);
    expect(removed.status).toBe(204);

    const gone = await request(server).get(`/chat/${conversation.id}`).set("Authorization", `Bearer ${KEY}`);
    expect(gone.status).toBe(404);
  });
});
