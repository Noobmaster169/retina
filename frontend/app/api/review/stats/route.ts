import { z } from "zod";

import { getReviewStats } from "@/lib/api-client";
import { badQuery, gatedRead } from "@/lib/api-route";

const Query = z.object({ runId: z.uuid().optional() });

/** What the queue holds and what it has been getting through. */
export async function GET(request: Request) {
  const query = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return badQuery(query.error.issues);
  return gatedRead("read review stats", () => getReviewStats(query.data.runId));
}
