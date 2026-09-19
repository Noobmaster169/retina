import { z } from "zod";

/**
 * What `/api/runs/[id]/eval` answers: the headline of the dev-only local
 * scoring, with the wrong-id lists and confusion matrices left on the server.
 *
 * Shared so the handler that builds it and the cell that renders it cannot
 * drift apart. Holds no secret, so a client component may import it.
 */
const Headline = z.object({
  finalScore: z.number(),
  stage1MacroF1: z.number(),
  endToEndRate: z.number(),
  nEmails: z.number(),
});

export const LocalEval = z.object({
  run: Headline,
  holdout: Headline,
  wrongCategory: z.number(),
});
export type LocalEval = z.infer<typeof LocalEval>;
