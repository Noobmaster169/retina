import { z } from "zod";

import { listReviewCases } from "@/lib/api-client";
import { ReviewReason } from "@/lib/api/runs-schemas";
import { badQuery, gatedRead } from "@/lib/api-route";

/** Mirrors the backend's own query, so a filter it would refuse is a 400 here and not read as an outage. */
const Query = z.object({
  runId: z.uuid().optional(),
  status: z.enum(["open", "resolved", "all"]).optional(),
  reason: ReviewReason.optional(),
  kind: z.enum(["review", "failure"]).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

/** The cases waiting for a person, oldest first. */
export async function GET(request: Request) {
  const query = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return badQuery(query.error.issues);
  return gatedRead("list review cases", () => listReviewCases(query.data));
}
