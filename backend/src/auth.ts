import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { config } from "./config";

/** Which shared key authenticated a request. */
export type Caller = "frontend" | "team";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      caller?: Caller;
    }
  }
}

function equal(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Two keys, two callers: the frontend (the Next.js server, the only holder of
 * API_SHARED_SECRET) and the team (people and scripts holding TEAM_API_KEY).
 * Either may be unset, in which case that caller simply cannot authenticate.
 *
 * Applied to everything except /health. This is the whole of access control
 * for llm-proxy, which trusts anything that reaches its loopback port — so
 * with no key configured this refuses to serve rather than serving everyone.
 */
export function requireCaller(req: Request, res: Response, next: NextFunction): void {
  const keys = { frontend: config.API_SHARED_SECRET, team: config.TEAM_API_KEY };
  if (!keys.frontend && !keys.team) {
    res.status(500).json({ error: "No API keys configured" });
    return;
  }

  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const caller: Caller | null = !token
    ? null
    : keys.frontend && equal(token, keys.frontend)
      ? "frontend"
      : keys.team && equal(token, keys.team)
        ? "team"
        : null;

  if (!caller) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.caller = caller;
  next();
}
