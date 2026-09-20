import { describe, expect, it } from "vitest";

import { chat, chatLive } from "../../src/ontology/repositories";
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
        outcome: "answered",
        checked: [],
        next: [],
        clarify: null,
        semantic: [],
        standingVersion: 1,
        grounded: [],
      });
      const recent = await chat.recentTurns(tx, conversation.id, 20);
      expect(recent.map((turn) => turn.role)).toEqual(["user", "assistant"]);
      expect(recent[1].sqlUsed).toEqual(["select 1"]);
    });
  });
});

describe("a turn's steps while it runs", () => {
  const assistant = (answer: string) => ({
    answer, sqlUsed: [], toolCalls: [], graph: null, proposal: null, reading: "", skillsUsed: [],
    adhoc: false, outcome: "answered" as const, checked: [], next: [], clarify: null, semantic: [],
    standingVersion: 2, grounded: [],
  });

  it("returns only rows newer than the id asked for, tool rows included", async () => {
    await inRollback(async (tx) => {
      const conversation = await chat.create(tx, { actor: "a test" });
      const asked = await chat.addUserTurn(tx, conversation.id, "a question");
      await chatLive.addToolTurn(tx, conversation.id, asked.id, {
        tool: "find_entity", args: { text: "Alpha" }, thought: "Grounding the name.",
        ok: true, preview: "2 candidates", durationMs: 12,
      });
      const answered = await chat.addAssistantTurn(tx, conversation.id, assistant("an answer"));

      const after = await chatLive.turnsAfter(tx, conversation.id, asked.id);
      expect(after.map((turn) => turn.role)).toEqual(["tool", "assistant"]);
      expect(after[0].toolCalls[0]).toMatchObject({ tool: "find_entity", preview: "", thought: "Grounding the name." });
      expect(after[0].toolCalls[0].args).toEqual({ text: "Alpha" });
      expect(after[0].toolCalls[0].durationMs).toBe(12);

      // Nothing is newer than the answer, which is how the page knows to stop polling.
      expect(await chatLive.turnsAfter(tx, conversation.id, answered.id)).toEqual([]);
    });
  });

  it("keeps its steps out of the thread and out of the turn count", async () => {
    await inRollback(async (tx) => {
      const conversation = await chat.create(tx, { actor: "a test" });
      const asked = await chat.addUserTurn(tx, conversation.id, "a question");
      for (const tool of ["find_entity", "run_recipe"] as const) {
        await chatLive.addToolTurn(tx, conversation.id, asked.id, {
          tool, args: {}, thought: "", ok: true, preview: "", durationMs: 1,
        });
      }
      await chat.addAssistantTurn(tx, conversation.id, assistant("an answer"));

      expect((await chat.turns(tx, conversation.id)).map((turn) => turn.role)).toEqual(["user", "assistant"]);
      expect((await chat.recentTurns(tx, conversation.id, 20)).map((turn) => turn.role)).toEqual(["user", "assistant"]);
      expect((await chat.find(tx, conversation.id))?.turnCount).toBe(2);
    });
  });
});
