import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { Router } from "express";

import {
  ATTACHMENT_NAME_REGEX,
  EMAIL_ID_REGEX,
  fetchAttachment,
  getEmail,
  listEmails,
  type ListQuery,
} from "../emails";

const EMAILS_PAGE_LIMIT = 50;
const EMAILS_PAGE_LIMIT_CEILING = 200;
const MAX_QUERY_CHARS = 200;

/** Query string → validated list query, or the message to send back as a 400. */
function parseListQuery(query: Record<string, unknown>): { ok: true; q: ListQuery } | { ok: false; error: string } {
  const positiveInt = (value: unknown, fallback: number): number | null => {
    if (value === undefined) return fallback;
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? n : null;
  };
  const page = positiveInt(query.page, 1);
  const limit = positiveInt(query.limit, EMAILS_PAGE_LIMIT);
  if (page === null) return { ok: false, error: "page must be a positive integer" };
  if (limit === null || limit > EMAILS_PAGE_LIMIT_CEILING) {
    return { ok: false, error: `limit must be an integer from 1 to ${EMAILS_PAGE_LIMIT_CEILING}` };
  }
  const q: ListQuery = { page, limit };
  if (query.q !== undefined) {
    if (typeof query.q !== "string" || query.q.length > MAX_QUERY_CHARS) {
      return { ok: false, error: `q must be a string of at most ${MAX_QUERY_CHARS} characters` };
    }
    q.q = query.q;
  }
  if (query.filter !== undefined) {
    if (query.filter !== "attachments") return { ok: false, error: 'filter must be "attachments"' };
    q.filter = query.filter;
  }
  return { ok: true, q };
}

/** The public webmail view: the inbox as the email server holds it, outside any run. */
export function emailsRouter(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const parsed = parseListQuery(req.query as Record<string, unknown>);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.json(await listEmails(parsed.q));
  });

  // Declared before /:id so "attachments" is never taken for an id.
  router.get("/attachments/:name", async (req, res) => {
    const name = String(req.params.name);
    if (!ATTACHMENT_NAME_REGEX.test(name)) {
      res.status(400).json({ error: "bad attachment name" });
      return;
    }
    const upstream = await fetchAttachment(name);
    res.status(200);
    for (const header of ["content-type", "content-length"]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.setHeader("content-disposition", `attachment; filename="${name}"`);
    if (!upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body as NodeReadableStream).pipe(res);
  });

  router.get("/:id", async (req, res) => {
    const id = String(req.params.id);
    if (!EMAIL_ID_REGEX.test(id)) {
      res.status(400).json({ error: "bad email id" });
      return;
    }
    res.json(await getEmail(id));
  });

  return router;
}
