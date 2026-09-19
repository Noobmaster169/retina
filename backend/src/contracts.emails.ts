import { z } from "zod";

import { DecidedBy, Stage } from "./contracts.enums";
import { Outcome } from "./contracts.review";
import { Category, ComparisonField } from "./contracts.scoring";

/**
 * A run's emails as the run page lists them. Re-exported from contracts.ts;
 * mirrored in frontend/lib/api/trace-schemas.ts.
 */

export const EmailListItem = z.object({
  emailId: z.string(),
  from: z.string(),
  subject: z.string(),
  stage: Stage,
  attachmentCount: z.number(),
  outcome: z.string().nullable(),
  /** Null until the email is classified. */
  category: Category.nullable(),
  decidedBy: DecidedBy.nullable(),
  /** The generator's own stated confidence, which is what decides whether the verifier runs. */
  confidence: z.number().nullable(),
  /** The verifier's category, when it ran. Differs from the generator's when it overruled it. */
  verifierCategory: Category.nullable(),
  /** The fields the judge found different, in the enum's order. Empty until the pair is compared. */
  defectFields: z.array(ComparisonField),
  error: z.string().nullable(),
});
export type EmailListItem = z.infer<typeof EmailListItem>;

export const RunEmailsQuery = z.object({
  stage: Stage.optional(),
  category: Category.optional(),
  decidedBy: DecidedBy.optional(),
  /** How the email ended. The stored value stays a plain string, so a later phase can add one without breaking a read. */
  outcome: Outcome.optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});
export type RunEmailsQuery = z.infer<typeof RunEmailsQuery>;

export const RunEmailsPage = z.object({
  emails: z.array(EmailListItem),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type RunEmailsPage = z.infer<typeof RunEmailsPage>;
