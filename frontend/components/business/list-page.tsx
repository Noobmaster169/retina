import type { ReactNode } from "react";

import { TopBar } from "@/components/shell/top-bar";

/** A list page: the crumb, the display line, one sentence, the toolbar, then whatever view is on. */
export function ListPage({
  crumb,
  title,
  lede,
  toolbar,
  children,
}: {
  crumb: string;
  title: string;
  lede: string;
  toolbar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 grow flex-col">
      <TopBar crumbs={[{ label: crumb }]} />
      <main className="min-h-0 grow overflow-y-auto px-7 pb-8">
        <div className="py-5">
          <h1 className="font-display text-display font-normal tracking-[-0.01em]">{title}</h1>
          <p className="mt-0.5 max-w-[68ch] text-body text-ink-tertiary">{lede}</p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">{toolbar}</div>
        {children}
      </main>
    </div>
  );
}
