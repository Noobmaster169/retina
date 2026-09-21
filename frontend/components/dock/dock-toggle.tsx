"use client";

import { Icon } from "@/components/ui/icons";

import { useDock } from "./dock-state";

/** The one control on every top bar that opens the dock. Hidden while it is open: the dock has its own close. */
export function DockToggle() {
  const dock = useDock();
  if (dock.open) return null;
  return (
    <button
      type="button"
      onClick={() => dock.setOpen(true)}
      aria-label="Open Ask Retina"
      className="flex h-8 items-center gap-1.5 rounded-md border border-hairline-strong px-2.5 text-strong text-ink-secondary hover:border-ink-faint"
    >
      <Icon name="chat" size={13} className="text-accent" />
      Ask
    </button>
  );
}
