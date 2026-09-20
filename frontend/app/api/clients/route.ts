import { listClients } from "@/lib/api-client";
import { gatedRead } from "@/lib/api-route";

/** Every sender the inbox has seen, with the tier that orders its work. */
export async function GET() {
  return gatedRead("list clients", () => listClients());
}
