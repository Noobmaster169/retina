import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icons";

import { AppShell } from "./app-shell";
import { Search, TopBar } from "./top-bar";

/**
 * A destination the rail offers that this phase does not build. It is the same
 * shell, the same rail and the same type as every other page, because the one
 * thing worse than a page that is not finished is a page that is not finished
 * and looks like a different product.
 *
 * It says what will be here and which phase brings it. It is not an error and
 * it is not styled as one: nothing has gone wrong, this part is simply later.
 */

interface PlaceholderProps {
  active: string;
  title: string;
  crumbs: string[];
  /** One sentence on what this page is for, in the present tense. */
  blurb: string;
  /** What it will hold, in the words the design uses for each. */
  holds: string[];
  /** Which phase builds it, named the way `docs/04-phases.md` names it. */
  phase: string;
  icon: IconName;
  children?: ReactNode;
}

export function Placeholder({ active, title, crumbs, blurb, holds, phase, icon, children }: PlaceholderProps) {
  return (
    <AppShell active={active} counts={{}}>
      <div className="flex min-w-0 grow flex-col">
        <TopBar crumbs={crumbs.map((label) => ({ label }))}>
          <Search />
          <span className="inline-flex h-[30px] items-center rounded-md bg-sunken px-3 text-small font-medium text-ink-tertiary">
            {phase}
          </span>
        </TopBar>

        <main className="min-h-0 grow overflow-y-auto px-7 pb-8">
          <div className="py-5">
            <h1 className="font-display text-display font-normal tracking-[-0.01em]">{title}</h1>
            <p className="mt-0.5 max-w-[68ch] text-body text-ink-tertiary">{blurb}</p>
          </div>

          <section className="max-w-[560px] rounded-xl border border-hairline">
            <header className="flex h-11 items-center gap-2 px-4">
              <Icon name={icon} size={15} className="text-ink-tertiary" />
              <h2 className="text-[14px] font-semibold tracking-[-0.01em]">What will be here</h2>
            </header>
            {holds.map((held) => (
              <p key={held} className="border-t border-hairline-faint px-4 py-2.5 text-small text-ink-secondary">
                {held}
              </p>
            ))}
            <footer className="border-t border-hairline px-4 py-3">
              <p className="text-small leading-[18px] text-ink-tertiary">
                Nothing is broken. This is drawn in the canvas and built in {phase}; the rail keeps it so the
                navigation does not change shape when it lands.
              </p>
            </footer>
          </section>

          {children}
        </main>
      </div>
    </AppShell>
  );
}
