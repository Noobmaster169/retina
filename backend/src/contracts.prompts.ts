import { z } from "zod";

/** What a run can be told to use: each step's prompt versions on disk. Mirrored in frontend/lib/api/runs-schemas.ts. */
export const PromptVersionInfo = z.object({
  version: z.string(),
  /** The proxy alias the file names. */
  model: z.string(),
  /** Runs use this version unless they name another. */
  active: z.boolean(),
  notes: z.string().nullable(),
});
export type PromptVersionInfo = z.infer<typeof PromptVersionInfo>;

export const PromptCatalog = z.object({
  steps: z.array(z.object({ step: z.string(), versions: z.array(PromptVersionInfo) })),
});
export type PromptCatalog = z.infer<typeof PromptCatalog>;
