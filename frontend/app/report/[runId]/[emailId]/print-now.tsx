"use client";

import { useEffect } from "react";

/**
 * Opens the browser's print dialog once, for the tab the Export control
 * opened. Only when the address says so: the same page without `?print=1` is
 * a link somebody can be sent and read, and a page that printed itself on
 * every visit could not be that.
 */
export function PrintNow({ when }: { when: boolean }) {
  useEffect(() => {
    if (!when) return;
    // After paint, or the dialog captures a page whose fonts have not landed.
    const id = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(id);
  }, [when]);
  return null;
}
