import { Router } from "express";

import type { Caller } from "../auth";
import { chat, type ChatMessage, type ChatRequest, listModels } from "../llm";

const MODEL_REGEX = /^[\w.:-]{1,64}$/;
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

export function aiRouter(): Router {
  const router = Router();

  router.get("/models", async (_req, res) => {
    res.json({ models: await listModels() });
  });

  router.post("/chat", async (req, res) => {
    const parsed = parseChatBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.json(await chat(req.caller as Caller, parsed.req));
  });

  return router;
}
