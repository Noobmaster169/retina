import { getShipment } from "@/lib/api-client";
import { gatedRead } from "@/lib/api-route";

/** One shipment, or the sentence that says nothing was read from that email. */
export async function GET(_request: Request, ctx: RouteContext<"/api/shipments/[emailId]">) {
  const { emailId } = await ctx.params;
  return gatedRead("read a shipment", async () => (await getShipment(emailId)) ?? { error: "No shipment was read from that email." });
}
