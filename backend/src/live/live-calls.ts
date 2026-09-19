import { z } from "zod";

/**
 * A model call in flight, as the run page shows it: what the model has written
 * so far. Ephemeral by design. The ledger (core.llm_calls) is the record of a
 * call once it ends; this exists only while it runs, so a missed write costs a
 * moment of preview and nothing else.
 */
export const LiveCall = z.object({
  emailRunId: z.string(),
  step: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  attempt: z.number(),
  /** The answer so far. With a schema, the JSON as the model writes it. */
  text: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
});
export type LiveCall = z.infer<typeof LiveCall>;

/** Where in-flight calls are kept: Redis in the stack, memory in tests. */
export interface LiveCalls {
  put(call: LiveCall): Promise<void>;
  clear(emailRunId: string): Promise<void>;
  /** The live call of each email run that has one; others are absent. */
  get(emailRunIds: string[]): Promise<LiveCall[]>;
  close(): Promise<void>;
}
