import { z } from "zod";

import { listShipments } from "@/lib/api-client";
import { badQuery, gatedRead } from "@/lib/api-route";

const Query = z.object({
  partyId: z.string().regex(/^\d+$/).optional(),
  portId: z.string().regex(/^\d+$/).optional(),
  disputed: z.enum(["true", "false"]).optional(),
  q: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

/** Shipments as the mail states them, filtered as the list page asks. */
export async function GET(request: Request) {
  const query = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return badQuery(query.error.issues);
  return gatedRead("list shipments", () => listShipments(query.data));
}
