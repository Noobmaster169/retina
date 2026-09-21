"use client";

import { Dialog } from "radix-ui";
import { motion } from "motion/react";
import { useState } from "react";

import { Icon } from "@/components/ui/icons";
import type { DocumentView } from "@/lib/api/trace-schemas";
import { browserCanDraw, fileHref } from "@/lib/files";
import { panel, scrim } from "@/lib/motion";

import { DocumentBody, openingReading, ReadingPick, type Reading } from "./document-reading";

/**
 * One document, whole, over the comparison rather than instead of it.
 *
 * A sheet and not a centred modal. A shipping document is tall, and the field
 * list stays visible behind it so closing this is not a return journey.
 *
 * What each reading means is in `document-reading.tsx`, which the documents
 * tab draws from too.
 */

export function DocumentSheet({ document: doc, onClose }: { document: DocumentView; onClose: () => void }) {
  const [reading, setReading] = useState<Reading>(() => openingReading([doc]));
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
              <ReadingPick on={reading === "arrived"} disabled={!browserCanDraw(doc.format)} onClick={() => setReading("arrived")}>
                As it arrived
              </ReadingPick>
              <ReadingPick on={reading === "parsed"} disabled={doc.textObjectKey === null} onClick={() => setReading("parsed")}>
                As the parser read it
              </ReadingPick>
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
              <DocumentBody document={doc} reading={reading} />
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
