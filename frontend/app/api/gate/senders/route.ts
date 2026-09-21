import { listGateSenders } from "@/lib/api-client";
import { gatedRead } from "@/lib/api-route";

/** Every principal the gate has an opinion about, with what it has earned. */
export async function GET() {
  return gatedRead("list gate senders", () => listGateSenders());
}
