import { describe, expect, it } from "vitest";

import { chat } from "../../src/ontology/repositories";
import { inRollback } from "../db";

/**
 * The two readings of a conversation, which are not the same reading.
 *
 * `turns` draws the thread from the top. `recentTurns` is what the model is
 * given back, and handing it the first page instead of the last was a bug
 * nothing would have shown until a conversation ran past twenty turns: the
 * model would have been given the opening exchanges, none of the recent ones,
 * and would have answered the question before last.
 */

describe("a conversation's turns", () => {
  it("reads from the top, and from the end, differently", async () => {
    await inRollback(async (tx) => {
      const conversation = await chat.create(tx, { actor: "a test" });
      for (let n = 1; n <= 25; n++) await chat.addUserTurn(tx, conversation.id, `question ${n}`);

      const thread = await chat.turns(tx, conversation.id, 5);
      expect(thread.map((turn) => turn.content)).toEqual([
        "question 1",
        "question 2",
        "question 3",
        "question 4",
        "question 5",
      ]);

      // What the model is given: the newest five, still in the order they were
      // asked, so "the previous question" means the previous one.
      const recent = await chat.recentTurns(tx, conversation.id, 5);
      expect(recent.map((turn) => turn.content)).toEqual([
        "question 21",
        "question 22",
        "question 23",
        "question 24",
        "question 25",
      ]);
    });
  });

  it("is the whole conversation when it is shorter than the window", async () => {
    await inRollback(async (tx) => {
      const conversation = await chat.create(tx, { actor: "a test" });
      await chat.addUserTurn(tx, conversation.id, "the only question");
      const recent = await chat.recentTurns(tx, conversation.id, 20);
      expect(recent.map((turn) => turn.content)).toEqual(["the only question"]);
    });
  });

  it("leaves out tool turns, which live on the assistant turn that made them", async () => {
    await inRollback(async (tx) => {
      const conversation = await chat.create(tx, { actor: "a test" });
      await chat.addUserTurn(tx, conversation.id, "a question");
      await chat.addAssistantTurn(tx, conversation.id, {
        answer: "an answer",
        sqlUsed: ["select 1"],
        toolCalls: [],
        graph: null,
        proposal: null,
        reading: "",
        skillsUsed: [],
        adhoc: false,
      });
      const recent = await chat.recentTurns(tx, conversation.id, 20);
      expect(recent.map((turn) => turn.role)).toEqual(["user", "assistant"]);
      expect(recent[1].sqlUsed).toEqual(["select 1"]);
    });
  });
});
