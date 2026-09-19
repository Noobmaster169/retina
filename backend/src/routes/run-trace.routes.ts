import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import { type LlmCallList, RunCallsQuery, RunEmailsQuery } from "../contracts";
import { emails, llmCalls } from "../ontology/repositories";
import { runIdParam } from "./params";

const EmailIdParam = z.string().regex(/^email_\w{1,32}$/);

/** What a run did, email by email and call by call: the list, the live feed, and one email's trace. */
export function runTraceRouter(deps: { pool: Pool }): Router {
  const router = Router();
  const { pool } = deps;

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
    const body: LlmCallList = { calls: await llmCalls.listRecent(pool, id, query.data) };
    res.json(body);
  });

  router.get("/:id/emails/:emailId/calls", async (req, res) => {
    const id = runIdParam(req, res);
    if (!id) return;
    const emailId = EmailIdParam.safeParse(req.params.emailId);
    if (!emailId.success) {
      res.status(400).json({ error: "bad email id" });
      return;
    }
    const body: LlmCallList = { calls: await llmCalls.listForEmail(pool, id, emailId.data) };
    res.json(body);
  });

  return router;
}
