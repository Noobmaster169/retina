import Form from "next/form";
import Link from "next/link";

import type { EmailPage } from "@/lib/api-client";
import { type InboxParams, inboxQuery } from "@/lib/inbox";

import { MailList } from "./mail-list";

interface Props {
  page: EmailPage | null;
  backendError: string | null;
  params: InboxParams;
  /** The open message, if any. Decides which pane a phone shows. */
  selectedId: string | null;
  children: React.ReactNode;
}

/**
 * Three panes: folders, the message list, and whatever is open. On a phone
 * only one of the last two is visible: the list on /, the message on /mail/[id].
 */
export function MailShell({ page, backendError, params, selectedId, children }: Props) {
  const reading = selectedId !== null;
  const folders = [
    { key: undefined, label: "Inbox", count: page?.counts.all },
    { key: "attachments" as const, label: "With attachments", count: page?.counts.attachments },
  ];

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <aside className="flex shrink-0 items-center gap-3 overflow-x-auto border-b border-hairline bg-sunken px-4 py-2.5 lg:w-56 lg:flex-col lg:items-stretch lg:gap-0 lg:overflow-visible lg:border-r lg:border-b-0 lg:px-0 lg:py-0">
        <Link href="/" className="whitespace-nowrap text-base font-semibold tracking-tight lg:px-5 lg:py-4">
          Retina Mail
        </Link>
        <nav aria-label="Folders" className="flex gap-1 lg:flex-col lg:px-2">
          {folders.map((f) => {
            const active = params.filter === f.key;
            return (
              <Link
                key={f.label}
                href={`/${inboxQuery(params, { filter: f.key, page: 1 })}`}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${
                  active ? "bg-active font-medium" : "text-ink-tertiary hover:bg-active/60 hover:text-ink"
                }`}
              >
                <span>{f.label}</span>
                {f.count !== undefined && (
                  <span className="hidden text-xs tabular-nums text-ink-tertiary lg:inline">{f.count}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex gap-4 whitespace-nowrap text-sm text-ink-tertiary lg:mt-auto lg:ml-0 lg:flex-col lg:gap-0 lg:border-t lg:border-hairline">
          <Link href="/runs" className="hover:text-ink lg:px-5 lg:py-3">
            Pipeline runs
          </Link>
          <Link href="/chat" className="hover:text-ink lg:border-t lg:border-hairline lg:px-5 lg:py-3">
            Ask a model
          </Link>
        </div>
      </aside>

      <section
        aria-label="Messages"
        className={`flex min-h-0 flex-1 flex-col bg-canvas lg:w-[26rem] lg:flex-none lg:border-r lg:border-hairline ${
          reading ? "hidden lg:flex" : "flex"
        }`}
      >
        <Form action="/" className="border-b border-hairline p-3">
          {params.filter && <input type="hidden" name="filter" value={params.filter} />}
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search sender, subject or body"
            aria-label="Search messages"
            className="w-full rounded-md border border-hairline bg-sunken px-3 py-2 text-sm placeholder:text-ink-tertiary focus:border-hairline-strong focus:bg-canvas"
          />
        </Form>
        {backendError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center text-sm">
            <p className="font-medium">The inbox is not reachable right now.</p>
            <p className="text-ink-tertiary">{backendError}</p>
          </div>
        ) : page ? (
          <MailList page={page} params={params} selectedId={selectedId} />
        ) : null}
      </section>

      <main className={`min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas ${reading ? "flex" : "hidden lg:flex"} flex-col`}>
        {children}
      </main>
    </div>
  );
}
