import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import type { ChatSkillCards, ChatThread, ChatTurnsAfter, ProposedAction } from "../contracts";
import { NewConversation, NewMessage } from "../contracts";
import { skills } from "../agents/chat/skills/registry";
import type { LlmClient } from "../agents/llm-client";
import { chat, chatLive } from "../ontology/repositories";
import { answerTurn } from "./chat.turn";

/**
 * Asking a question and getting an answer with its working shown.
 *
 * The POST holds until the answer, as it always has: there is no streaming
 * (`docs/01-product.md` section 7) and no queue. What is new is that the turn's
 * steps are readable while it runs, through `GET /:id/turns?after=`, which the
 * page polls against the id of the question it just asked. Stopping is the
 * client aborting the POST.
 */

export interface ChatRouteDeps {
  pool: Pool;
  /** Where model-written SQL runs. Null when DATABASE_RO_URL is unset; run_sql then refuses and says why. */
  roPool: Pool | null;
  llm: LlmClient;
}

const IdParam = z.uuid();

/**
 * Phase 10 proposes and never applies.
 *
 * The contract is docs/03-infra-deep.md section 5.5 and `ProposedAction` in
 * contracts.chat.ts. The phase's scope says write tools are out, so the agent
 * has no tool that could write one and nothing sets it. It is drawn with both
 * buttons disabled and this sentence under them, rather than left off the page:
 * the card is what phase 11 turns on, and hiding it now would hide the thing
 * being deferred.
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

  /** The skills a person may pick, as the composer's `/` menu lists them. */
  router.get("/skills", (_req, res) => {
    const body: ChatSkillCards = {
      skills: [...skills().values()].map((skill) => ({ name: skill.name, version: skill.version, when: skill.when })),
    };
    res.json(body);
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

  /**
   * The turns of a conversation newer than one id, this turn's steps included.
   *
   * The page polls this while its own POST is in flight, which is how the steps
   * appear one by one rather than all at once with the answer. It is the only
   * read that returns `role = 'tool'` rows.
   */
  router.get("/:id/turns", async (req, res) => {
    const id = IdParam.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "bad conversation id" });
      return;
    }
    const after = Number(req.query.after);
    if (!Number.isInteger(after) || after < 0) {
      res.status(400).json({ error: "after must be a turn id" });
      return;
    }
    const body: ChatTurnsAfter = { turns: await chatLive.turnsAfter(deps.pool, id.data, after) };
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
    const unknown = body.data.skills.filter((name) => !skills().has(name));
    if (unknown.length > 0) {
      res.status(400).json({ error: `no such skill: ${unknown.join(", ")}` });
      return;
    }
    const conversation = await chat.find(deps.pool, id.data);
    if (!conversation) {
      res.status(404).json({ error: "no such conversation" });
      return;
    }

    // Stopping is the client aborting its own POST. Express reports that as
    // `close` before a response was sent, and the loop reads the flag between
    // steps, so a model call already in flight finishes and is still paid for
    // and recorded rather than being abandoned half written.
    let stopped = false;
    req.on("close", () => {
      if (!res.writableEnded) stopped = true;
    });

    const answer = await answerTurn({ ...deps, stopped: () => stopped }, conversation, body.data);
    // A stopped turn is stored, so the thread keeps what it found, and then has
    // nobody to answer: the client that aborted is gone.
    if (!stopped) res.json(answer);
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
