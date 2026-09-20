import { getHealth } from "@/lib/api-client";
import { gatedRead } from "@/lib/api-route";

/** What the rail's dependency row reads. Degraded is a 200: a dependency down is a reading, not an outage. */
export async function GET() {
  return gatedRead("get health", () => getHealth());
}
