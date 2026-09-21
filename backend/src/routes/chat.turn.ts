import type { Pool } from "pg";

import type { ChatAnswer, ChatConversation, NewMessage } from "../contracts";
import { resolveContext } from "../agents/chat/context";
import { runTurn } from "../agents/chat/loop";
import { renderMemory } from "../agents/chat/memory";
import { orientationFor } from "../agents/chat/orientation";
import { standing } from "../agents/chat/standing";
import type { LlmClient } from "../agents/llm-client";
import { childLogger } from "../lib/logger";
import { chat, chatLive, chatMemory, chatState } from "../ontology/repositories";

/**
 * One turn, end to end: load what the agent is given, run it, store what came
 * back. Split from chat.routes.ts, which does the HTTP around it.
 *
 * Thin on purpose. Everything here is load, call, save; the pipeline is in
 * `agents/chat/`, and nothing in this file decides anything about an answer.
 */

const log = childLogger({ module: "chat.turn" });

/**
 * How much of the conversation the model is given back: the last twenty turns.
 *
 * Ten exchanges is more than any question here has needed, and the whole
 * history of a long conversation would crowd out the schema documentation,
 * which is what actually decides whether the answer is right.
 */
const HISTORY_TURNS = 20;

export interface TurnDeps {
  pool: Pool;
  /** Where model-written SQL runs. Null when DATABASE_RO_URL is unset; the tools then refuse and say why. */
  roPool: Pool | null;
  llm: LlmClient;
  /** Whether the person has stopped this turn. Read between steps. */
  stopped(): boolean;
}

export async function answerTurn(
  deps: TurnDeps,
  conversation: ChatConversation,
  message: NewMessage,
): Promise<ChatAnswer> {
  const id = conversation.id;

  // The question is stored before the model is asked. A turn that fails halfway
  // must still leave the person's own words on the page, or they retype them.
  // Its id is what this turn's steps are written against, and what the page
  // polls from while the answer is still coming.
  const asked = await chat.addUserTurn(deps.pool, id, message.content, message.context);
  await chat.titleIfUnnamed(deps.pool, id, message.content);

  const previous = await chat.recentTurns(deps.pool, id, HISTORY_TURNS);
  const history = previous
    .slice(0, -1)
    .flatMap((turn) => (turn.role === "tool" ? [] : [{ role: turn.role, content: turn.content }]));

  const scope = {
    runId: conversation.scope.runId,
    emailId: conversation.scope.emailId,
    context: await resolveContext(deps.pool, message.context),
  };
  // Read where the agent's own queries run, so the orientation never shows it
  // something it could not reach; without a read-only pool the tools refuse anyway.
  const [orientation, stickySkills, memory] = await Promise.all([
    orientationFor({ read: deps.roPool ?? deps.pool, write: deps.pool }, { id, runId: scope.runId }),
    chatState.stickySkills(deps.pool, id),
    chatMemory.memoryOf(deps.pool, id),
  ]);

  const result = await runTurn(
    {
      llm: deps.llm,
      pool: deps.pool,
      tools: { pool: deps.pool, roPool: deps.roPool, llm: deps.llm, runId: scope.runId, emailId: scope.emailId },
      onStep: async (calls) => {
        for (const call of calls) await chatLive.addToolTurn(deps.pool, id, asked.id, call);
      },
      stopped: deps.stopped,
    },
    {
      question: message.content,
      history,
      scope,
      orientation,
      today: new Date().toISOString().slice(0, 10),
      stickySkills,
      pickedSkills: message.skills,
      memory: renderMemory(memory),
    },
  );

  const turn = await chat.addAssistantTurn(deps.pool, id, {
    answer: result.answer,
    sqlUsed: result.sqlUsed,
    toolCalls: result.toolCalls,
    graph: result.graph,
    reading: result.reading,
    skillsUsed: result.skillsUsed,
    adhoc: result.adhoc,
    outcome: result.outcome,
    checked: result.checked,
    next: result.next,
    clarify: result.clarify,
    semantic: result.semantic,
    standingVersion: standing().version,
    grounded: result.grounded,
    // Nothing in phase 10 proposes one yet; the field exists so the shape the
    // card reads is settled and phase 11 fills it rather than inventing it.
    proposal: null,
  });

  log.info(
    { conversationId: id, tools: result.toolCalls.length, outcome: result.outcome, exhausted: result.exhausted },
    "a chat turn answered",
  );
  return { turn, exhausted: result.exhausted };
}
