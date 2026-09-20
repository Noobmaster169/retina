import Link from "next/link";

import { ChatPanel } from "@/components/chat-panel";
import { listModels, type ModelInfo } from "@/lib/api-client";

// Reads the backend on every request; there is nothing here to prerender.
export const dynamic = "force-dynamic";

// The chat server action runs inside this route's function on Vercel, and a
// cold local model can take a minute or more. 300s is the Hobby plan ceiling;
// lib/api-client.ts times out just under it so the user sees a message rather
// than a platform error.
export const maxDuration = 300;

export default async function Home() {
  let models: ModelInfo[] = [];
  let backendError: string | null = null;
  try {
    models = await listModels();
  } catch (error) {
    backendError = error instanceof Error ? error.message : "Backend unreachable";
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <Link href="/" className="text-sm text-ink-tertiary hover:text-ink">
        ← Inbox
      </Link>
      <h1 className="mt-4 text-xl font-semibold">Ask a model</h1>
      <p className="mt-1 text-sm text-ink-tertiary">
        Goes through the backend on the Monash box to the llm-proxy and a model.
      </p>
      <div className="mt-8">
        {backendError ? (
          <div className="rounded-xl border border-dashed border-hairline px-5 py-12 text-center text-sm">
            <p className="font-medium">Backend unreachable</p>
            <p className="mt-1 text-ink-tertiary">{backendError}</p>
          </div>
        ) : (
          <ChatPanel models={models} />
        )}
      </div>
    </main>
  );
}
