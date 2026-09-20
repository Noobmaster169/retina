import Link from "next/link";

import { Chip, toneOf } from "@/components/ui/chip";
import type { RunEmailItem } from "@/lib/api/trace-schemas";

/**
 * Every email of the run, as things rather than as rows.
 *
 * The same list the inbox draws, read through the ontology: what a reader picks
 * here they then read as a record and as a graph. It carries the two facts that
 * decide whether an email is worth opening from here, its category and how it
 * came out, and nothing else.
 */

export function OntologyEmailList({ emails, hrefFor, openId }: {
  emails: RunEmailItem[];
  hrefFor(emailId: string): string;
  openId: string | null;
}) {
  return (
    <div className="flex min-h-0 grow flex-col">
      <div className="flex h-[34px] shrink-0 items-center gap-[22px] border-b border-hairline px-7">
        <span className="w-[104px] text-caption text-ink-faint">Email</span>
        <span className="grow text-caption text-ink-faint">Subject</span>
        <span className="w-[150px] text-caption text-ink-faint">Sorted as</span>
        <span className="w-[120px] text-caption text-ink-faint">Differed on</span>
        <span className="w-[120px] text-right text-caption text-ink-faint">How it ended</span>
      </div>
      <ul className="min-h-0 grow overflow-y-auto">
        {emails.map((email) => (
          <li key={email.emailId}>
            <Link
              href={hrefFor(email.emailId)}
              aria-current={email.emailId === openId ? "page" : undefined}
              className={`flex h-11 items-center gap-[22px] border-b border-hairline-faint px-7 ${
                email.emailId === openId ? "bg-active" : "hover:bg-surface"
              }`}
            >
              <span className="w-[104px] shrink-0 truncate font-mono text-mono-sm text-ink">{email.emailId}</span>
              <span className="min-w-0 grow truncate text-strong text-ink">{email.subject}</span>
              <span className="w-[150px] shrink-0 truncate font-mono text-mono-xs text-ink-tertiary">
                {email.category ?? "not sorted"}
              </span>
              <span
                className={`w-[120px] shrink-0 truncate font-mono text-mono-xs ${
                  email.defectFields.length > 0 ? "text-differ" : "text-ink-faint"
                }`}
              >
                {email.defectFields.length > 0 ? email.defectFields.join(", ") : "nothing"}
              </span>
              <span className="flex w-[120px] shrink-0 justify-end">
                <Chip tone={toneOf(email.outcome)} mono>
                  {email.outcome ?? email.stage}
                </Chip>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
