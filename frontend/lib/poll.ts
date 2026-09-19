import type { z } from "zod";

/**
 * An SWR fetcher for the frontend's own /api routes, parsing what comes back.
 * Browser side, so it holds no secret; the route handlers add the backend's.
 */
export function parsedFetcher<T>(schema: z.ZodType<T>): (url: string) => Promise<T> {
  return async (url) => {
    const response = await fetch(url);
    const body: unknown = await response.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (response.ok && parsed.success) return parsed.data;
    const refusal = typeof body === "object" && body !== null && "error" in body ? String(body.error) : null;
    throw new Error(refusal ?? `Request failed with ${response.status}`);
  };
}
