import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import { ReviewActionBody, ReviewQuery, UploadBody } from "../contracts";
import { TerminalError } from "../lib/errors";
import { reviewCases } from "../ontology/repositories";
import { applyAction, type ReviewDeps } from "../review/actions";
import { applyUpload, MAX_UPLOAD_BYTES } from "../review/upload";
import type { ObjectStore } from "../storage";

/**
 * The review inbox: what is waiting, one case with its history, and every
 * write a person makes. The routes validate and hand over; the semantics are
 * in src/review/, which is the only place that knows what an action does.
 */

export interface ReviewRouteDeps extends ReviewDeps {
  store: ObjectStore | null;
}

const CaseId = z.string().regex(/^\d{1,19}$/);
const StatsQuery = z.object({ runId: z.uuid().optional() });

/** In memory, because the file is checked by its own bytes and then goes straight to the object store. */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

export function reviewRouter(deps: ReviewRouteDeps): Router {
  const router = Router();

  /** A refusal a person can act on: the case is not in a state where this means anything, or the file is not what it claims. */
  function refuse(res: Parameters<Parameters<Router["get"]>[1]>[1], error: unknown): void {
    if (!(error instanceof TerminalError)) throw error;
    res.status(409).json({ error: error.message });
  }

  // Before /:id, which would otherwise take "stats" as a case id.
  router.get("/stats", async (req, res) => {
    const query = StatsQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "invalid query", issues: query.error.issues });
      return;
    }
    res.json(await reviewCases.stats(deps.db, query.data.runId ?? null));
  });

  router.get("/", async (req, res) => {
    const query = ReviewQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "invalid query", issues: query.error.issues });
      return;
    }
    res.json(await reviewCases.list(deps.db, query.data));
  });

  router.get("/:id", async (req, res) => {
    const id = CaseId.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "bad case id" });
      return;
    }
    const found = await reviewCases.view(deps.db, id.data);
    if (!found) {
      res.status(404).json({ error: "no such case" });
      return;
    }
    res.json(found);
  });

  router.post("/:id/actions", async (req, res) => {
    const id = CaseId.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "bad case id" });
      return;
    }
    const body = ReviewActionBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "invalid action", issues: body.error.issues });
      return;
    }
    try {
      const result = await applyAction(deps, id.data, body.data);
      if (!result) {
        res.status(404).json({ error: "no such case" });
        return;
      }
      res.json(result);
    } catch (error) {
      refuse(res, error);
    }
  });

  router.post("/:id/upload", upload.single("file"), async (req, res) => {
    const id = CaseId.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "bad case id" });
      return;
    }
    const body = UploadBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "invalid upload", issues: body.error.issues });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "no file was sent" });
      return;
    }
    try {
      const result = await applyUpload(deps, id.data, body.data, { filename: req.file.originalname, bytes: req.file.buffer });
      if (!result) {
        res.status(404).json({ error: "no such case" });
        return;
      }
      res.json(result);
    } catch (error) {
      refuse(res, error);
    }
  });

  return router;
}
