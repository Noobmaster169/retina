import { listInboxes } from "@/lib/api-client";
import { gatedRead } from "@/lib/api-route";

/** The inboxes a new run may read. A pass-through, so the shared secret stays on the server. */
export async function GET() {
  return gatedRead("list inboxes", () => listInboxes());
}
