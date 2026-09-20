import { Router } from "express";

import { childLogger } from "../lib/logger";
import type { ObjectStore } from "../storage";

const log = childLogger({ module: "files.routes" });

/**
 * One object out of the store, streamed. The original attachments, the page
 * images of a scan, and the documents a reviewer supplied all live behind this
 * one route, because they are all objects and the key says which.
 *
 * Keys are read only and never written here. A key that walks out of the
 * bucket is refused rather than resolved, so a path a caller composed cannot
 * reach an object the product did not put there.
 */

/**
 * The object key the route's wildcard names, or null when it is not one this
 * product wrote. A segment that walks up the tree is refused rather than
 * resolved, so a key a caller composed cannot reach an object outside the
 * prefixes storage/keys.ts builds.
 */
export function fileKeyFrom(wildcard: unknown): string | null {
  const key = Array.isArray(wildcard) ? wildcard.join("/") : String(wildcard ?? "");
  if (key.length === 0 || key.length > 512) return null;
  if (key.startsWith("/")) return null;
  const segments = key.split("/");
  if (segments.includes("..") || segments.includes(".") || segments.includes("")) return null;
  return key;
}

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  txt: "text/plain; charset=utf-8",
  json: "application/json",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function contentType(key: string): string {
  return TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

export function filesRouter(deps: { store: ObjectStore | null }): Router {
  const router = Router();

  router.get("/*key", async (req, res, next) => {
    const key = fileKeyFrom(req.params.key);
    if (!key) {
      res.status(400).json({ error: "bad key" });
      return;
    }
    if (!deps.store) {
      res.status(503).json({ error: "object storage is not configured" });
      return;
    }
    if (!(await deps.store.exists(key))) {
      res.status(404).json({ error: "no such object" });
      return;
    }
    // The bucket is private and the api is the only way in, so nothing here is
    // cached by anything in front of it.
    res.setHeader("content-type", contentType(key));
    res.setHeader("cache-control", "private, max-age=60");
    const stream = await deps.store.stream(key);
    stream.on("error", (error: Error) => {
      log.warn({ key, err: error.message }, "the object stream broke");
      next(error);
    });
    stream.pipe(res);
  });

  return router;
}
