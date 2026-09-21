import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";

/** The shell mounts once here, so the rail and the chat dock outlive every page under it. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
