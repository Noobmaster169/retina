import { createConversation, listConversations } from "@/lib/api-client";
import { backendFailure, gatedRead } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get("runId") ?? undefined;
  return gatedRead("list conversations", async () => ({ conversations: await listConversations(runId) }));
}

/** Opening a conversation is a write, and the only one this phase makes from the chat. */
export async function POST(request: Request) {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  try {
    const outcome = await createConversation(await request.json());
    if (!outcome.ok) return Response.json({ error: outcome.message }, { status: 502 });
    return Response.json(outcome.value);
  } catch (error) {
    return backendFailure("open a conversation", error);
  }
}
