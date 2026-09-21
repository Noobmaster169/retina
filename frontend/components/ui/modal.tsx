"use client";

import { Dialog } from "radix-ui";
import type { ReactNode } from "react";

import { Icon } from "./icons";

/**
 * The one overlay in the product that takes the whole screen: a scrim, a
 * panel in the middle, escape and the scrim to close. Radix does the focus
 * trap and the labelling; this file only says what it looks like.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  note,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(1200px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-hairline bg-canvas shadow-overlay"
        >
          <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-hairline px-4">
            <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em]">{title}</Dialog.Title>
            {note ? <Dialog.Description className="min-w-0 truncate text-small text-ink-tertiary">{note}</Dialog.Description> : null}
            <span className="grow" />
            <Dialog.Close
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-sm text-ink-faint hover:bg-active hover:text-ink-secondary"
            >
              <Icon name="close" size={13} />
            </Dialog.Close>
          </header>
          <div className="min-h-0 grow overflow-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
