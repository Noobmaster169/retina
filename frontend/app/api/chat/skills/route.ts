import { listSkills } from "@/lib/api-client";
import { gatedRead } from "@/lib/api-route";

/** The skills a person may pick, for the composer's menu. */
export async function GET() {
  return gatedRead("list the chat's skills", async () => ({ skills: await listSkills() }));
}
