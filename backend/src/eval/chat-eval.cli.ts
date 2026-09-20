// pnpm eval:chat [--limit N] [--tag T] [--ids a,b]
// Runs the chat question set through the real loop and says, per question, whether the turn
// looked before it filtered, used the standard query, and named what it should. It spends
// tokens: development runs use --limit; the full set is the user's to start.

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { proxyLlmClient, type LlmClient } from "../agents";
import { runTurn } from "../agents/chat/loop";
import { renderOrientation } from "../agents/chat/orientation";
import { closePool, closeRoPool, getPool, getRoPool } from "../db";
import { TerminalError } from "../lib/errors";
import { orientation } from "../ontology/repositories";
import { ChatQuestionSet, scoreTurn, summarise, type Scored } from "./chat-score";

const HERE = dirname(fileURLToPath(import.meta.url));
const QUESTIONS = join(HERE, "../../eval/chat-questions.json");
const REPORTS = join(HERE, "../../eval/reports");

const { values } = parseArgs({
  options: { limit: { type: "string" }, tag: { type: "string" }, ids: { type: "string" } },
});

/** Counts model calls, which is what a step is, without reaching into the loop. */
function counting(inner: LlmClient): { client: LlmClient; taken: () => number; reset: () => void } {
  let count = 0;
  return {
    client: {
      async complete(request) {
        count += 1;
        return inner.complete(request);
      },
    },
    taken: () => count,
    reset: () => {
      count = 0;
    },
  };
}

function line(item: Scored, seconds: number): string {
  const failed = item.checks.filter((check) => !check.ok).map((check) => `${check.name}${check.detail ? ` (${check.detail})` : ""}`);
  const how = item.adhoc ? "own sql" : item.recipes.length > 0 ? item.recipes.join(",") : "no query";
  return `${item.passed ? "pass" : "FAIL"}  ${item.id.padEnd(24)} ${String(item.steps).padStart(2)} steps ${seconds.toFixed(0).padStart(4)} s  ${how}${failed.length > 0 ? `\n      ${failed.join("; ")}` : ""}`;
}

async function main(): Promise<void> {
  const roPool = getRoPool();
  if (!roPool) throw new TerminalError("DATABASE_RO_URL is not set, so the chat's tools cannot read anything");
  const pool = getPool();

  const wantedIds = values.ids?.split(",").map((id) => id.trim());
  const questions = ChatQuestionSet.parse(JSON.parse(readFileSync(QUESTIONS, "utf8")))
    .filter((question) => !values.tag || question.tags.includes(values.tag))
    .filter((question) => !wantedIds || wantedIds.includes(question.id))
    .slice(0, values.limit ? Number(values.limit) : undefined);
  if (questions.length === 0) throw new TerminalError("no question matches those filters");

  const runId = await orientation.latestRunId(roPool);
  const llm = counting(proxyLlmClient({ maxConcurrency: 2 }));
  const today = new Date().toISOString().slice(0, 10);
  const scored: Scored[] = [];
  const turns: Record<string, unknown> = {};

  for (const question of questions) {
    const scope = { runId: question.scoped ? runId : null, emailId: null };
    llm.reset();
    const started = Date.now();
    const result = await runTurn(
      { llm: llm.client, pool, tools: { pool, roPool, ...scope } },
      {
        question: question.question,
        history: [],
        scope,
        orientation: renderOrientation(await orientation.snapshot(roPool, scope.runId)),
        today,
        stickySkills: [],
        pickedSkills: [],
        // Each question is asked in its own turn, so there is nothing earlier to remember.
        memory: "",
      },
    );
    const item = scoreTurn(question, result, { steps: llm.taken(), runId, removedMoves: result.removedMoves });
    scored.push(item);
    turns[question.id] = { question: question.question, reading: result.reading, answer: result.answer, calls: result.toolCalls.map((call) => ({ tool: call.tool, args: call.args, ok: call.ok, preview: call.preview })), checks: item.checks };
    console.log(line(item, (Date.now() - started) / 1000));
  }

  const summary = summarise(scored);
  console.log(
    `\n${summary.passed} of ${summary.questions} passed. Of the turns that queried, answered from recipes alone: ${(summary.recipeOnlyShare * 100).toFixed(0)}%; ${summary.noQuery} needed no query. ` +
      `Median steps: ${summary.medianSteps}. Guard refusals: ${summary.guardRefusals}.` +
      (summary.adhoc.length > 0 ? `\nNeeded its own SQL, so candidates for a recipe: ${summary.adhoc.join(", ")}` : ""),
  );

  await mkdir(REPORTS, { recursive: true });
  const path = join(REPORTS, `chat-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(path, JSON.stringify({ runId, summary, turns }, null, 2));
  console.log(`\nEvery answer and call: ${path}`);
}

try {
  await main();
} finally {
  await closePool();
  await closeRoPool();
}
