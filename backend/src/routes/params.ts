import type { Request, Response } from "express";
import { z } from "zod";

/** The run id from the path, or null after answering 400. */
export function runIdParam(req: Request, res: Response): string | null {
  const id = z.uuid().safeParse(req.params.id);
  if (id.success) return id.data;
  res.status(400).json({ error: "bad run id" });
  return null;
}
