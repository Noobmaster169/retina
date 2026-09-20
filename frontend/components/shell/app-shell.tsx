"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Rail } from "./rail";
import type { NavCounts } from "./nav";

/**
 * Every screen is this: a rail, then panes a hairline apart. The rail's width
 * is the only piece of shell state, and it lives here so a pane that needs the
 * width can ask for it: the documents view is drawn with the rail closed
 * because two documents side by side is what that screen is for.
 */

interface AppShellProps {
  active: string;
  counts: NavCounts;
  rail?: ReactNode;
  children: ReactNode;
  /**
   * A pane asking for the width. Flipping it closes the rail and flipping it
   * back reopens it, but only when the person has not since decided otherwise:
   * their click on the rail's own control always wins over the request.
   */
  wantsWidth?: boolean;
}

export function AppShell({ active, counts, rail, children, wantsWidth = false }: AppShellProps) {
  const [railOpen, setRailOpen] = useState(!wantsWidth);
  const [override, setOverride] = useState(false);
  const previous = useRef(wantsWidth);

  useEffect(() => {
    if (previous.current === wantsWidth) return;
    previous.current = wantsWidth;
    // A new request supersedes an earlier manual choice: the person asked for
    // this pane, not for the rail they set two screens ago.
    setOverride(false);
    setRailOpen(!wantsWidth);
  }, [wantsWidth]);

  function toggle() {
    setOverride(true);
    setRailOpen((open) => !open);
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      <Rail open={override ? railOpen : !wantsWidth} onToggle={toggle} active={active} counts={counts}>
        {rail}
      </Rail>
      {children}
    </div>
  );
}
