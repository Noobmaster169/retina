import { MailShell } from "@/components/mail-shell";
import { loadInbox, readInboxParams } from "@/lib/inbox";

// Reads the backend on every request; there is nothing here to prerender.
export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: PageProps<"/">) {
  const params = readInboxParams(await searchParams);
  const { page, backendError } = await loadInbox(params);

  return (
    <MailShell page={page} backendError={backendError} params={params} selectedId={null}>
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-ink-tertiary">
        {page ? <p>Select a message to read it.</p> : null}
      </div>
    </MailShell>
  );
}
