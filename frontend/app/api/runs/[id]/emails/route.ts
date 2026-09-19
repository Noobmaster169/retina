import { z } from "zod";

import { Category, DecidedBy, listRunEmails, Stage } from "@/lib/api-client";
import { badQuery, passThrough } from "@/lib/api-route";

/** Mirrors RunEmailsQuery in backend/src/contracts.ts; change both or neither. */
const Query = z.object({
  stage: Stage.optional(),
  category: Category.optional(),
  decidedBy: DecidedBy.optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

/** The run's emails, one page at a time, with the filters the page offers. */
export async function GET(request: Request, ctx: RouteContext<"/api/runs/[id]/emails">) {
  const { id } = await ctx.params;
  const query = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return badQuery(query.error.issues);
  return passThrough("list run emails", id, () => listRunEmails(id, query.data));
}
