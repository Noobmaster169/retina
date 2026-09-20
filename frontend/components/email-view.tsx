import Link from "next/link";

import type { Email } from "@/lib/api-client";

import { Paperclip } from "./paperclip-icon";

/** "attachments/email_004_SI.txt" → "email_004_SI.txt". */
export function attachmentName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

interface Props {
  email: Email;
  /** Text attachments already read, keyed by file name, for inline preview. */
  previews: Record<string, string>;
  /** Where the back link on a phone goes: the list, as it was. */
  backHref: string;
}

export function EmailView({ email, previews, backHref }: Props) {
  const initial = email.from.trim().charAt(0).toUpperCase() || "?";

  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8">
      <Link href={backHref} className="mb-4 inline-block text-sm text-ink-tertiary hover:text-ink lg:hidden">
        ← Inbox
      </Link>

      <h1 className="text-xl font-semibold leading-snug break-words">{email.subject}</h1>

      <div className="mt-5 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-surface"
        >
          {initial}
        </span>
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{email.from}</p>
          <p className="text-ink-tertiary">{email.email_id}</p>
        </div>
      </div>

      <pre className="mt-6 font-sans text-[15px] leading-relaxed whitespace-pre-wrap break-words">{email.body}</pre>

      {email.attachments.length > 0 && (
        <section aria-label="Attachments" className="mt-8 border-t border-hairline pt-5">
          <h2 className="text-sm font-medium">
            <Paperclip /> {email.attachments.length === 1 ? "1 attachment" : `${email.attachments.length} attachments`}
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {email.attachments.map((path) => {
              const name = attachmentName(path);
              const preview = previews[name];
              return (
                <li key={path} className="rounded-md border border-hairline">
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <a
                      href={`/attachments/${encodeURIComponent(name)}`}
                      download={name}
                      className="shrink-0 text-sm text-ink hover:underline"
                    >
                      Download
                    </a>
                  </div>
                  {preview !== undefined && (
                    <pre className="max-h-96 overflow-auto border-t border-hairline bg-sunken px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                      {preview}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </article>
  );
}
