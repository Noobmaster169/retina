"use client";

import { Dialog } from "radix-ui";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import useSWR from "swr";

import { Icon } from "@/components/ui/icons";
import type { DocumentView } from "@/lib/api/trace-schemas";
import { browserCanDraw, fileHref, textFetcher } from "@/lib/files";
import { panel, scrim } from "@/lib/motion";

/**
 * One document, whole, over the comparison rather than instead of it.
 *
 * Two readings, because they answer two questions. `As it arrived` is the file
 * the sender sent, which is what a person checks a draft against. `As the
 * parser read it` is the text every model in this product was given, which is
 * the honest answer to "why did it think that" and the only reading a
 * spreadsheet has at all: no browser draws xlsx or docx, and converting them
 * on the server to make a picture would be a third reading nobody asked for.
 *
 * A sheet and not a centred modal. A shipping document is tall, and the field
 * list stays visible behind it so closing this is not a return journey.
 */

type Reading = "arrived" | "parsed";

export function DocumentSheet({ document: doc, onClose }: { document: DocumentView; onClose: () => void }) {
  const drawable = browserCanDraw(doc.format);
  const [reading, setReading] = useState<Reading>(drawable ? "arrived" : "parsed");
  const href = fileHref(doc.objectKey);

  return (
    <Dialog.Root open onOpenChange={(next) => (next ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={scrim} className="fixed inset-0 z-40 bg-ink/15" />
        </Dialog.Overlay>
        <Dialog.Content asChild>
          <motion.div
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={panel}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[760px] flex-col border-l border-hairline bg-canvas shadow-[var(--shadow-overlay)]"
          >
            <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-hairline px-5">
              <span className="inline-flex h-[19px] shrink-0 items-center rounded-xs border border-hairline bg-surface px-1.5 font-mono text-[10px] text-ink-secondary">
                {doc.role}
              </span>
              <Dialog.Title className="min-w-0 truncate font-mono text-mono-sm">{doc.filename}</Dialog.Title>
              <span className="shrink-0 text-micro text-ink-tertiary">
                {doc.format}, {doc.pages} page{doc.pages === 1 ? "" : "s"}
              </span>
              <span className="grow" />
              <Dialog.Close
                aria-label="Close the document"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-tertiary transition-colors duration-150 hover:bg-active hover:text-ink"
              >
                <Icon name="close" size={12} />
              </Dialog.Close>
            </header>
            <Dialog.Description className="sr-only">{doc.filename} as it arrived, and as the parser read it.</Dialog.Description>

            <div className="flex h-[38px] shrink-0 items-center gap-1 border-b border-hairline px-5">
              <Pick on={reading === "arrived"} disabled={!drawable} onClick={() => setReading("arrived")}>
                As it arrived
              </Pick>
              <Pick on={reading === "parsed"} disabled={doc.textObjectKey === null} onClick={() => setReading("parsed")}>
                As the parser read it
              </Pick>
              <span className="grow" />
              <a
                href={href}
                download={doc.filename}
                className="text-caption text-ink-tertiary underline underline-offset-2 transition-colors duration-150 hover:text-ink"
              >
                Download
              </a>
            </div>

            <div className="min-h-0 grow overflow-hidden">
              {reading === "arrived" ? <Arrived doc={doc} href={href} drawable={drawable} /> : <Parsed doc={doc} />}
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Pick({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "This file has no such reading" : undefined}
      aria-pressed={on}
      className={`inline-flex h-[25px] items-center rounded-sm border px-2 text-caption transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? "border-hairline-strong bg-active font-medium text-ink" : "border-hairline text-ink-secondary hover:bg-sunken"
      }`}
    >
      {children}
    </button>
  );
}

/** The file as it was sent. The browser draws a PDF; text is text; nothing else can be drawn at all. */
function Arrived({ doc, href, drawable }: { doc: DocumentView; href: string; drawable: boolean }) {
  if (!drawable) {
    return (
      <Note>
        No browser draws a {doc.format} file. Read it through the parser beside this, which is the text every model in this
        product was given, or download the original.
      </Note>
    );
  }
  if (doc.format === "pdf") return <iframe src={href} title={doc.filename} className="h-full w-full border-0 bg-sunken" />;
  return <Text href={href} />;
}

/** The text the parser read out of the file, which is what every model in the product was given. */
function Parsed({ doc }: { doc: DocumentView }) {
  if (doc.textObjectKey === null) {
    return <Note>The parser could not read this file, so there is no text to show. Nothing was read from it and nothing was guessed.</Note>;
  }
  return <Text href={fileHref(doc.textObjectKey)} />;
}

function Text({ href }: { href: string }) {
  const { data, error, isLoading } = useSWR(href, textFetcher, { revalidateOnFocus: false });
  if (isLoading) return <Note>Reading it.</Note>;
  if (error instanceof Error) return <Note>{error.message}</Note>;
  return (
    <pre className="h-full overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-mono-sm leading-[19px] text-ink-secondary">
      {data}
    </pre>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-[60ch] px-5 py-4 text-small leading-5 text-ink-tertiary">{children}</p>;
}
