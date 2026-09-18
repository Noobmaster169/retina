import Link from "next/link";

import type { EmailPage } from "@/lib/api-client";

import { type InboxParams, inboxQuery } from "./mail-shell";

/** "docs@vitalsolutions.sg" → "docs", the part a list can show at a glance. */
function senderName(from: string): string {
  return from.split("@")[0] ?? from;
}

export function MailList({ page, params, selectedId }: { page: EmailPage; params: InboxParams; selectedId: string | null }) {
  const first = (page.page - 1) * page.limit + 1;
  const last = Math.min(page.page * page.limit, page.total);
  const lastPage = Math.max(1, Math.ceil(page.total / page.limit));

  if (page.total === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm">
        <p className="font-medium">No messages match “{params.q}”.</p>
        <Link href={`/${inboxQuery(params, { q: undefined, page: 1 })}`} className="text-accent-ink hover:underline">
          Clear the search
        </Link>
      </div>
    );
  }

  return (
    <>
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {page.emails.map((email) => {
          const selected = email.id === selectedId;
          return (
            <li key={email.id} className="border-b border-line">
              <Link
                href={`/mail/${email.id}${inboxQuery(params)}`}
                aria-current={selected ? "page" : undefined}
                className={`block border-l-[3px] px-4 py-2.5 ${
                  selected ? "border-ink bg-sel" : "border-transparent hover:bg-paper"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{senderName(email.from)}</span>
                  {email.attachmentCount > 0 && (
                    <span className="shrink-0 text-xs text-muted" title={`${email.attachmentCount} attachments`}>
                      <Paperclip /> {email.attachmentCount}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm">{email.subject}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{email.snippet}</p>
              </Link>
            </li>
          );
        })}
      </ol>
      <nav aria-label="Pages" className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted">
        <span className="tabular-nums">
          {first}–{last} of {page.total}
        </span>
        <span className="flex gap-3">
          <PageLink disabled={page.page <= 1} href={`/${inboxQuery(params, { page: page.page - 1 })}`}>
            Newer
          </PageLink>
          <PageLink disabled={page.page >= lastPage} href={`/${inboxQuery(params, { page: page.page + 1 })}`}>
            Older
          </PageLink>
        </span>
      </nav>
    </>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <span aria-disabled="true" className="opacity-40">{children}</span>;
  return (
    <Link href={href} className="text-ink hover:underline">
      {children}
    </Link>
  );
}

export function Paperclip() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" className="inline -mt-0.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10.5 5.5 6 10a1.5 1.5 0 0 0 2.1 2.1l5-5a3 3 0 0 0-4.2-4.2l-5.5 5.5a4.5 4.5 0 0 0 6.4 6.4L13.5 11" />
    </svg>
  );
}
