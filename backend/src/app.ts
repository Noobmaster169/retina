import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import express, { type NextFunction, type Request, type Response } from "express";

import { type Caller, requireCaller } from "./auth";
import { getPool } from "./db";
import {
  ATTACHMENT_NAME_REGEX,
  EMAIL_ID_REGEX,
  EmailServerError,
  fetchAttachment,
  getEmail,
  listEmails,
  type ListQuery,
} from "./emails";
import { chat, type ChatMessage, type ChatRequest, listModels, LlmProxyError } from "./llm";

const MODEL_REGEX = /^[\w.:-]{1,64}$/;
const EMAILS_PAGE_LIMIT = 50;
const EMAILS_PAGE_LIMIT_CEILING = 200;
const MAX_QUERY_CHARS = 200;
const MAX_CONTENT_CHARS = 200_000;
const MAX_SYSTEM_CHARS = 20_000;
const MAX_TOKENS_CEILING = 8192;

/** A validated body, or the message to send back as a 400. */
function parseChatBody(body: unknown): { ok: true; req: ChatRequest } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.model !== "string" || !MODEL_REGEX.test(b.model)) {
    return { ok: false, error: 'model must be an alias like "qwen" or "claude"' };
  }
  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    return { ok: false, error: "messages must be a non-empty array" };
  }

  const messages: ChatMessage[] = [];
  let chars = 0;
  for (const m of b.messages as unknown[]) {
    const msg = (m ?? {}) as Record<string, unknown>;
    if ((msg.role !== "user" && msg.role !== "assistant") || typeof msg.content !== "string") {
      return { ok: false, error: "each message needs role user|assistant and string content" };
    }
    chars += msg.content.length;
    messages.push({ role: msg.role, content: msg.content });
  }
  if (messages[0].role !== "user") return { ok: false, error: "the first message must be from the user" };
  if (chars > MAX_CONTENT_CHARS) return { ok: false, error: `messages exceed ${MAX_CONTENT_CHARS} characters` };

  const req: ChatRequest = { model: b.model, messages };
  if (b.system !== undefined) {
    if (typeof b.system !== "string" || b.system.length > MAX_SYSTEM_CHARS) {
      return { ok: false, error: `system must be a string of at most ${MAX_SYSTEM_CHARS} characters` };
    }
    req.system = b.system;
  }
  if (b.maxTokens !== undefined) {
    const n = b.maxTokens;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_TOKENS_CEILING) {
      return { ok: false, error: `maxTokens must be an integer from 1 to ${MAX_TOKENS_CEILING}` };
    }
    req.maxTokens = n;
  }
  return { ok: true, req };
}

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

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Unauthenticated: the compose healthcheck has no key, and it reveals
  // nothing but liveness. Deliberately does NOT check the proxy — a probe that
  // did would report the API down every time a model was cold.
  app.get("/health", async (_req, res) => {
    try {
      await getPool().query("select 1");
      res.json({ status: "ok", database: "up" });
    } catch (error) {
      res.status(503).json({ status: "error", database: "down", message: String(error) });
    }
  });

  app.use(requireCaller);

  app.get("/ai/models", async (_req, res, next) => {
    try {
      res.json({ models: await listModels() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/ai/chat", async (req, res, next) => {
    const parsed = parseChatBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      res.json(await chat(req.caller as Caller, parsed.req));
    } catch (error) {
      next(error);
    }
  });

  app.get("/emails", async (req, res, next) => {
    const parsed = parseListQuery(req.query as Record<string, unknown>);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      res.json(await listEmails(parsed.q));
    } catch (error) {
      next(error);
    }
  });

  // Declared before /emails/:id so "attachments" is never taken for an id.
  app.get("/emails/attachments/:name", async (req, res, next) => {
    const name = String(req.params.name);
    if (!ATTACHMENT_NAME_REGEX.test(name)) {
      res.status(400).json({ error: "bad attachment name" });
      return;
    }
    try {
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
    } catch (error) {
      next(error);
    }
  });

  app.get("/emails/:id", async (req, res, next) => {
    const id = String(req.params.id);
    if (!EMAIL_ID_REGEX.test(id)) {
      res.status(400).json({ error: "bad email id" });
      return;
    }
    try {
      res.json(await getEmail(id));
    } catch (error) {
      next(error);
    }
  });

  app.use(
    // Four parameters are what make Express treat this as an error handler.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof LlmProxyError || error instanceof EmailServerError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      console.error("[api] unhandled:", error);
      res.status(500).json({ error: "Internal error" });
    },
  );

  return app;
}
