import { listModels } from "@/lib/api-client";
import { gatedRead } from "@/lib/api-route";

/** The proxy's aliases, for the new-run form's model choice. */
export async function GET() {
  return gatedRead("list models", async () => ({ models: await listModels() }));
}
