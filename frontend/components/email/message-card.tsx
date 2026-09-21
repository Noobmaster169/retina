"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icons";
import type { DocumentView } from "@/lib/api/trace-schemas";

import { DocumentSheet } from "./document-sheet";
import { senderAddress, senderInitials, senderName } from "./sender";

/**
 * The email, walled off. This is the only bordered card in the product, and
 * the border is not decoration: the whole design problem on this page was that
 * a reader could not tell where the sender stopped and Retina started. A border
 * that means "this is not ours" earns its place.
 *
 * docs/05-design.md section 6, and the seam in seam.tsx directly under it.
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
}: {
  message: Message;
  documents?: DocumentView[];
  to?: string;
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
    if (!held || whole) return;
    setHidden(Math.round((held.scrollHeight - held.clientHeight) / BODY_LINE));
  }, [message.body, whole]);

  return (
    <article className="overflow-hidden rounded-lg border border-hairline-strong">
      <header className="flex items-center gap-2.5 border-b border-hairline bg-surface px-3.5 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-hairline bg-canvas text-[10.5px] font-semibold text-ink-secondary">
          {senderInitials(message.from)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-strong font-medium">{senderName(message.from)}</span>
          <span className="block text-caption text-ink-tertiary">
            {senderAddress(message.from)} to {to}
          </span>
        </span>
      </header>
      <div className="px-3.5 py-3.5">
        {/* `whitespace-pre-wrap`: the body arrives with its own line breaks and a
            signature block that is a stack of short lines. Collapsing them ran the
            whole email into one paragraph, which is not how it was written. */}
        <div ref={body} className="overflow-hidden" style={whole ? undefined : { maxHeight: FOLD_LINES * BODY_LINE }}>
          <p className="max-w-[68ch] whitespace-pre-wrap break-words text-body text-ink-secondary">{message.body.trim()}</p>
        </div>
        {hidden > 0 ? (
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
          <div className="mt-3 flex gap-2">
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

const CHIP = "flex min-w-0 shrink grow basis-0 items-center gap-2 rounded-md border border-hairline px-2.5 py-2 text-left";

/** One file the email carried. It opens the same sheet the documents tab opens, over the page. */
function Attachment({ name, document: doc, onOpen }: { name: string; document: DocumentView | null; onOpen: (document: DocumentView) => void }) {
  const lines = (
    <>
      <Icon name="doc" size={14} className="shrink-0 text-ink-faint" />
      <span className="min-w-0">
        <span className="block truncate font-mono text-micro">{name}</span>
        {doc ? <span className="block text-micro text-ink-tertiary">{size(doc.bytes)}</span> : null}
      </span>
    </>
  );
  if (!doc) return <span className={CHIP}>{lines}</span>;
  return (
    <button
      type="button"
      onClick={() => onOpen(doc)}
      title={`Open ${name}`}
      className={`${CHIP} transition-colors duration-150 hover:border-hairline-strong hover:bg-sunken`}
    >
      {lines}
    </button>
  );
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}
