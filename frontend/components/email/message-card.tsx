"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/ui/icons";
import type { DocumentView } from "@/lib/api/trace-schemas";

import { DocumentSheet } from "./document-sheet";
import { senderAddress, senderInitials, senderName } from "./sender";

/**
 * The email as an email, not as an application card. Spacing and the labelled
 * seam below it keep the sender's words distinct from Retina's reading.
 */

export interface Message {
  from: string;
  subject: string;
  body: string;
  /** Paths as the email server stores them: "attachments/email_004_SI.txt". */
  attachments: string[];
}

/**
 * How much of a long message is shown before it is folded, in lines of
 * `--text-body`. Fourteen is the greeting, the request and the top of the
 * address block, which is enough to know what the mail is; past that a forty
 * line shipping instruction pushed the seam and the check off the screen, and
 * the verdict is what the page is for.
 *
 * The cut is a whole number of lines so it lands between them, not through one.
 */
const BODY_LINE = 21;
const FOLD_LINES = 14;

function size(bytes: number | undefined): string | null {
  if (bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The sender's own words, as they arrived. Nothing here is stripped, cleaned
 * or summarised.
 *
 * `documents` is what the parser made of the attachments, which is what lets a
 * chip open. An attachment nothing has been read from yet is still drawn, as a
 * chip that does not press: the email said it was there.
 */
export function MessageCard({
  message,
  documents = [],
  to = "ops@aprilasia.com",
  foldBody = true,
  actions,
}: {
  message: Message;
  documents?: DocumentView[];
  to?: string;
  /** Keep long mail compact only when the page has analysis below it. */
  foldBody?: boolean;
  /** Sits on the right of the sender's name and address. Only the check passes any. */
  actions?: ReactNode;
}) {
  const [opened, setOpened] = useState<DocumentView | null>(null);
  const [whole, setWhole] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  /** How many lines the fold is hiding. Zero where the message fits, which is most of them. */
  const [hidden, setHidden] = useState(0);

  // Measured and not counted: the body wraps, so the lines on screen are not
  // the newlines in it. The fold is applied first and the overflow read back
  // from it, because a fold conditional on the overflow would never clamp,
  // never overflow, and never offer itself.
  useEffect(() => {
    const held = body.current;
    if (!held || whole || !foldBody) return;
    setHidden(Math.round((held.scrollHeight - held.clientHeight) / BODY_LINE));
  }, [foldBody, message.body, whole]);

  return (
    <article className="pb-5">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-tint text-[11px] font-semibold text-accent">
          {senderInitials(message.from)}
        </span>
        <span className="min-w-0 grow pt-0.5">
          <span className="block truncate text-strong font-medium">{senderName(message.from)}</span>
          <span className="block truncate text-caption text-ink-tertiary">{senderAddress(message.from)}</span>
        </span>
        {actions ? <div className="flex shrink-0 items-center gap-2 self-center">{actions}</div> : null}
      </header>
      <div className="mt-3 flex items-baseline gap-2 text-small">
        <span className="shrink-0 font-medium text-ink-tertiary">To</span>
        <span className="truncate text-ink-secondary">{to}</span>
      </div>
      <div className="mt-5">
        {/* `whitespace-pre-wrap`: the body arrives with its own line breaks and a
            signature block that is a stack of short lines. Collapsing them ran the
            whole email into one paragraph, which is not how it was written. */}
        <div ref={body} className="overflow-hidden" style={!foldBody || whole ? undefined : { maxHeight: FOLD_LINES * BODY_LINE }}>
          <p className="max-w-[68ch] whitespace-pre-wrap break-words text-body text-ink-secondary">{message.body.trim()}</p>
        </div>
        {foldBody && hidden > 0 ? (
          <button
            type="button"
            onClick={() => setWhole(!whole)}
            aria-expanded={whole}
            className="mt-2 text-caption text-ink-tertiary underline underline-offset-2 transition-colors duration-150 hover:text-ink"
          >
            {whole ? "Fold the message" : `Show the whole message, ${hidden} more line${hidden === 1 ? "" : "s"}`}
          </button>
        ) : null}
        {message.attachments.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {message.attachments.map((path) => (
              <Attachment
                key={path}
                name={basename(path)}
                document={documents.find((held) => held.filename === basename(path)) ?? null}
                onOpen={setOpened}
              />
            ))}
          </div>
        ) : null}
      </div>
      {opened ? <DocumentSheet document={opened} onClose={() => setOpened(null)} /> : null}
    </article>
  );
}

const LINK = "flex w-full min-w-0 items-start gap-2.5 text-left";

/** One file the email carried. It opens the same sheet the documents tab opens, over the page. */
function Attachment({ name, document: doc, onOpen }: { name: string; document: DocumentView | null; onOpen: (document: DocumentView) => void }) {
  const lines = (
    <>
      <Icon name="doc" size={18} className="mt-0.5 shrink-0 text-accent" />
      <span className="min-w-0">
        <span className="block truncate text-small font-medium text-accent underline underline-offset-2">{name}</span>
        {doc ? <span className="block text-micro text-ink-tertiary">{size(doc.bytes)}</span> : null}
      </span>
    </>
  );
  if (!doc) return <span className={LINK}>{lines}</span>;
  return (
    <button
      type="button"
      onClick={() => onOpen(doc)}
      title={`Open ${name}`}
      className={`${LINK} cursor-pointer rounded-sm transition-opacity duration-150 hover:opacity-75`}
    >
      {lines}
    </button>
  );
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}
