import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import {
  type DocumentView,
  type EmailTrace,
  type LiveCallView,
  type LlmCallSummaryList,
  RunCallsQuery,
  RunEmailsQuery,
  type RunLive,
} from "../contracts";
import { childLogger } from "../lib/logger";
import type { LiveCall, LiveCalls } from "../live";
import {
  classifications,
  comparisons,
  documents,
  emailRuns,
  emails,
  extractions,
  llmCalls,
  reviewCases,
  type StoredDocument,
} from "../ontology/repositories";
import { documentVerdicts } from "../pipeline/compare";
import { runIdParam } from "./params";

const EmailIdParam = z.string().regex(/^email_\w{1,32}$/);
const log = childLogger({ module: "run-trace.routes" });

export interface RunTraceDeps {
  pool: Pool;
  /** Where in-flight calls are kept. Absent, nothing is ever shown as live. */
  live?: LiveCalls;
}

/** The email's documents with the compare stage's verdict on each, so the page shows a reading rather than making one. */
function withVerdicts(docs: StoredDocument[]): DocumentView[] {
  const verdicts = documentVerdicts(docs);
  return docs.map((doc) => documents.toView(doc, verdicts.get(doc.filename) ?? "unknown"));
}

/** What a run did, email by email and call by call: the list, the live feed, and one email's trace. */
export function runTraceRouter(deps: RunTraceDeps): Router {
  const router = Router();
  const { pool } = deps;

  /** The live calls of these email runs. A preview is never worth failing the page over: Redis down reads as none. */
  async function liveOf(runs: { id: string; emailId: string }[]): Promise<LiveCallView[]> {
    if (!deps.live || runs.length === 0) return [];
    let found: LiveCall[];
    try {
      found = await deps.live.get(runs.map((run) => run.id));
    } catch (error) {
      log.warn({ err: error instanceof Error ? error.message : String(error) }, "live calls unavailable");
      return [];
    }
    const emailOf = new Map(runs.map((run) => [run.id, run.emailId]));
    return found.flatMap(({ emailRunId, ...call }) => {
      const emailId = emailOf.get(emailRunId);
      return emailId ? [{ emailId, ...call }] : [];
    });
  }

  router.get("/:id/emails", async (req, res) => {
    const id = runIdParam(req, res);
    if (!id) return;
    const query = RunEmailsQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "invalid query", issues: query.error.issues });
      return;
    }
    const { page, pageSize, ...filters } = query.data;
    const found = await emails.listForRun(pool, id, filters, { page, pageSize });
    res.json({ ...found, page, pageSize });
  });

  router.get("/:id/calls", async (req, res) => {
    const id = runIdParam(req, res);
    if (!id) return;
    const query = RunCallsQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "invalid query", issues: query.error.issues });
      return;
    }
    const body: LlmCallSummaryList = { calls: await llmCalls.listRecent(pool, id, query.data) };
    res.json(body);
  });

  router.get("/:id/live", async (req, res) => {
    const id = runIdParam(req, res);
    if (!id) return;
    const body: RunLive = { calls: await liveOf(await emailRuns.inFlight(pool, id)) };
    res.json(body);
  });

  router.get("/:id/emails/:emailId/trace", async (req, res) => {
    const id = runIdParam(req, res);
    if (!id) return;
    const emailId = EmailIdParam.safeParse(req.params.emailId);
    if (!emailId.success) {
      res.status(400).json({ error: "bad email id" });
      return;
    }
    const state = await emailRuns.stateOf(pool, id, emailId.data);
    if (!state) {
      res.status(404).json({ error: "no such email in this run" });
      return;
    }
    const [classification, docs, review, extracted, comparison, calls, live] = await Promise.all([
      classifications.view(pool, state.id),
      documents.listForEmailRun(pool, state.id),
      reviewCases.latestFor(pool, state.id),
      extractions.listForEmailRun(pool, state.id),
      comparisons.view(pool, state.id),
      llmCalls.listForEmail(pool, id, emailId.data),
      liveOf([{ id: state.id, emailId: emailId.data }]),
    ]);
    const body: EmailTrace = {
      emailId: emailId.data,
      stage: state.stage,
      error: state.error,
      classification,
      documents: withVerdicts(docs),
      review,
      extractions: extracted.map(extractions.toView),
      comparison,
      live: live[0] ?? null,
      calls,
    };
    res.json(body);
  });

  return router;
}
