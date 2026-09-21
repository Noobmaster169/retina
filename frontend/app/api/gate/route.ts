import { getGate } from "@/lib/api-client";
import { gatedRead } from "@/lib/api-route";

/** What mode the gate is in, what the day has cost, and how much is waiting. */
export async function GET() {
  return gatedRead("read the gate", () => getGate());
}
