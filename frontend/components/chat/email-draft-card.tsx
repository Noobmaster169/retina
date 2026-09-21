"use client";

import { useState } from "react";

import { senderAddress } from "@/components/email/sender";
import { Icon } from "@/components/ui/icons";
import type { EmailDraft } from "@/lib/api/chat-agent-schemas";

/**
 * A reply, ready to send from Gmail.
 *
 * There is no outbound mail behind this build: the inbox is the organisers'
 * synthetic fixture and not a real mailbox, so nothing here could send
 * anything even if it tried. `Open in Gmail` is Gmail's own compose URL, a
 * plain `https://` link, opened in a new tab with the message already
 * addressed and filled in.
 *
 * This was a `mailto:` link first. `mailto:` needs a mail client registered
 * with the operating system, and a desk with none configured, which a dev
 * machine often is, opens nothing and says nothing: the browser hands off to
 * the OS and the OS has nowhere to hand it. Gmail's link needs none of that,
 * so it is the one button now rather than a second, smaller way round the
 * first one's failure mode.
 *
 * `to` is a header value and may carry a display name (`Hanna Azhari
 * <hanna_azhari@...>`), shown in the card verbatim: it is the exact string a
 * `get_email` call was shown, and reducing it to a guessed first name (the way
 * a message card does for a person, `sales@roxcel.at` read as "sales") would
 * turn a traceable value into an invented one for the one field a reader
 * checks before trusting the rest. The link uses just the address, because
 * Gmail's own `to=` reads that literally.
 */
export function EmailDraftCard({ draft }: { draft: EmailDraft }) {
  const [copied, setCopied] = useState(false);
  const address = senderAddress(draft.to);
  const href = gmailComposeHref(address, draft.subject, draft.body);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(draft.body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // A clipboard permission can be refused; the text is still on screen to select by hand.
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-hairline-strong bg-canvas">
      <header className="flex items-center gap-2 border-b border-hairline bg-surface px-3 py-2.5">
        <Icon name="mail" size={13} className="text-accent" />
        <span className="text-strong font-medium">Draft reply</span>
        <span className="grow" />
        <span className="text-caption text-ink-faint">opens in Gmail</span>
      </header>

      <div className="px-3.5 py-3">
        <dl className="space-y-1">
          <Field label="To">{draft.to}</Field>
          <Field label="Subject">{draft.subject}</Field>
        </dl>
        <p className="mt-2.5 max-w-[68ch] whitespace-pre-wrap break-words text-small leading-5 text-ink-secondary">
          {draft.body}
        </p>
      </div>

      <div className="flex items-center gap-2 border-t border-hairline px-3 py-2.5">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex h-[30px] items-center gap-1.5 rounded-md bg-ink px-3 text-small font-medium text-ink-inverse transition-colors duration-150 hover:bg-ink/90"
        >
          <Icon name="send" size={12} className="text-ink-inverse" />
          Open in Gmail
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className="h-[30px] rounded-md border border-hairline-strong px-3 text-small text-ink-secondary transition-colors duration-150 hover:bg-sunken"
        >
          {copied ? "Copied" : "Copy the message"}
        </button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-14 shrink-0 pt-px text-caption text-ink-faint">{label}</dt>
      <dd className="min-w-0 grow truncate font-mono text-mono-xs text-ink-secondary">{children}</dd>
    </div>
  );
}

/**
 * Gmail's own compose URL, documented and stable, and an ordinary `https://`
 * link: `URLSearchParams`' `+`-for-space is exactly right here, since this is
 * the form encoding a browser query string actually uses.
 */
function gmailComposeHref(address: string, subject: string, body: string): string {
  const params = new URLSearchParams({ view: "cm", fs: "1", to: address, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}
