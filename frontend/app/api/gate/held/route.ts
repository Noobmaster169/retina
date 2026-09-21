import { listHeld } from "@/lib/api-client";
import { gatedRead } from "@/lib/api-route";

/** The holding pen: held for real, and nobody has released it. */
export async function GET() {
  return gatedRead("list held emails", () => listHeld());
}
