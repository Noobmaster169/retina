import { listPrompts } from "@/lib/api-client";
import { gatedRead } from "@/lib/api-route";

/** The prompt versions a new run may pin, for the new-run form. */
export async function GET() {
  return gatedRead("list prompts", () => listPrompts());
}
