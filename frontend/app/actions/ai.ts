"use server";

import * as apiClient from "@/lib/api-client";
import type { ChatOutcome, ChatRequest } from "@/lib/api-client";
import { hasSiteAccess } from "@/lib/site-gate";

/** The boundary between the browser and the backend. Validation is the backend's job. */
export async function sendChat(req: ChatRequest): Promise<ChatOutcome> {
  if (!(await hasSiteAccess())) return { ok: false, message: "Signed out. Reload the page to sign in." };
  try {
    return await apiClient.chat(req);
  } catch (error) {
    console.error("[sendChat] backend call failed:", error);
    return { ok: false, message: "Could not reach the backend. Please try again." };
  }
}
