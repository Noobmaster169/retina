import { z } from "zod";

/**
 * Enums more than one contract file needs. A leaf: it imports nothing of ours,
 * so contracts.ts and its siblings can all use it without a cycle.
 */

export const Stage = z.enum(["ingested", "classifying", "classified", "comparing", "review", "done", "failed"]);
export type Stage = z.infer<typeof Stage>;

/** Ours, not an organiser enum: which layer settled the category. */
export const DecidedBy = z.enum(["llm", "verifier", "human"]);
export type DecidedBy = z.infer<typeof DecidedBy>;
