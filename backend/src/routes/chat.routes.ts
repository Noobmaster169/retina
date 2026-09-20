import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import type { ChatAnswer, ChatThread, ProposedAction } from "../contracts";
import { NewConversation, NewMessage } from "../contracts";
import { runTurn } from "../agents/chat/loop";
import type { LlmClient } from "../agents/llm-client";
import { childLogger } from "../lib/logger";
import { chat } from "../ontology/repositories";

const log = childLogger({ module: "chat.routes" });

/**
 * Asking a question and getting an answer with its working shown.
 *
 * No streaming: `docs/01-product.md` section 7 puts it out of scope, so a turn
 * is one request that takes as long as it takes. The page draws the graph
 * building and a skeleton for the prose meanwhile.
 */

export interface ChatRouteDeps {
  pool: Pool;
  /** Where model-written SQL runs. Null when DATABASE_RO_URL is unset; run_sql then refuses and says why. */
  roPool: Pool | null;
  llm: LlmClient;
}

const IdParam = z.uuid();

/**
 * How much of the conversation the model is given back: the last twenty turns.
 *
 * Ten exchanges is more than any question here has needed, and the whole
 * history of a long conversation would crowd out the schema documentation,
 * which is what actually decides whether the answer is right.
 */
const HISTORY_TURNS = 20;

/**
 * Phase 10 proposes and never applies.
 *
 * The contract is docs/03-infra-deep.md section 5.5 and
 * `ProposedAction` in contracts.chat.ts. The phase's scope says write tools
 * are out, so the agent has no tool that could write one and this is the only
 * place a proposal could come from. It is drawn with both buttons disabled and
 * this sentence under them, rather than left off the page: the card is what
 * phase 11 turns on, and hiding it now would hide the thing being deferred.
 */
const NOT_YET: ProposedAction["blockedReason"] =
  "Retina can read and explain, and cannot yet write. Applying an action arrives in phase 11.";

export function chatRouter(deps: ChatRouteDeps): Router {
  const router = Router();

  router.post("/conversations", async (req, res) => {
    const body = NewConversation.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "invalid conversation", issues: body.error.issues });
      return;
    }
    res.status(201).json(await chat.create(deps.pool, body.data));
  });

  router.get("/conversations", async (req, res) => {
    const runId = typeof req.query.runId === "string" ? req.query.runId : null;
    if (runId !== null && !IdParam.safeParse(runId).success) {
      res.status(400).json({ error: "bad run id" });
      return;
    }
    res.json({ conversations: await chat.list(deps.pool, runId) });
  });

  router.get("/:id", async (req, res) => {
    const id = IdParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "bad conversation id" });
      return;
    }
    const conversation = await chat.find(deps.pool, id.data);
    if (!conversation) {
      res.status(404).json({ error: "no such conversation" });
      return;
    }
    const body: ChatThread = { conversation, turns: await chat.turns(deps.pool, id.data) };
    res.json(body);
  });

  router.post("/:id/messages", async (req, res) => {
    const id = IdParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "bad conversation id" });
      return;
    }
    const body = NewMessage.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "invalid message", issues: body.error.issues });
      return;
    }
    const conversation = await chat.find(deps.pool, id.data);
    if (!conversation) {
      res.status(404).json({ error: "no such conversation" });
      return;
    }

    // The question is stored before the model is asked. A turn that fails
    // halfway must still leave the person's own words on the page, or they
    // retype them.
    await chat.addUserTurn(deps.pool, id.data, body.data.content);
    await chat.titleIfUnnamed(deps.pool, id.data, body.data.content);

    const previous = await chat.recentTurns(deps.pool, id.data, HISTORY_TURNS);
    const history = previous
      .slice(0, -1)
      .map((turn) => `${turn.role === "user" ? "they asked" : "you answered"}: ${turn.content}`);

    const scope = { runId: conversation.scope.runId, emailId: conversation.scope.emailId };
    const result = await runTurn(
      { llm: deps.llm, pool: deps.pool, tools: { pool: deps.pool, roPool: deps.roPool, ...scope } },
      { question: body.data.content, history, scope },
    );

    const turn = await chat.addAssistantTurn(deps.pool, id.data, {
      answer: result.answer,
      sqlUsed: result.sqlUsed,
      toolCalls: result.toolCalls,
      graph: result.graph,
      // Nothing in phase 10 proposes one yet; the field exists so the shape the
      // card reads is settled and phase 11 fills it rather than inventing it.
      proposal: null,
    });

    log.info(
      { conversationId: id.data, tools: result.toolCalls.length, exhausted: result.exhausted },
      "a chat turn answered",
    );
    const answer: ChatAnswer = { turn, exhausted: result.exhausted };
    res.json(answer);
  });

  router.delete("/:id", async (req, res) => {
    const id = IdParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "bad conversation id" });
      return;
    }
    const removed = await chat.remove(deps.pool, id.data);
    res.status(removed ? 204 : 404).json(removed ? undefined : { error: "no such conversation" });
  });

  return router;
}

export { NOT_YET as ACTION_CARD_BLOCKED_REASON };
