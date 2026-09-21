import Link from "next/link";

import { AppShell } from "@/components/shell/app-shell";
import { TopBar } from "@/components/shell/top-bar";
import { Icon } from "@/components/ui/icons";

/**
 * A route that is not there. It keeps the shell: walking off the end of the
 * product should not look like leaving it, and the rail is how a person gets
 * back without the browser's own button.
 */
export default function NotFound() {
  return (
    <AppShell>
      <div className="flex min-w-0 grow flex-col">
        <TopBar crumbs={[{ label: "Not found" }]} />
        <main className="min-h-0 grow overflow-y-auto px-7 pb-8">
          <div className="py-5">
            <h1 className="font-display text-display font-normal tracking-[-0.01em]">Nothing here</h1>
            <p className="mt-0.5 max-w-[68ch] text-body text-ink-tertiary">
              That address does not name a run, an email or any other page Retina has. It may have been a run that was
              deleted, or a link from a version of the product that drew things differently.
            </p>
          </div>
          <Link
            href="/runs"
            className="inline-flex h-[34px] items-center gap-2 rounded-md bg-ink px-4 text-strong font-medium text-ink-inverse transition-opacity duration-150 hover:opacity-90"
          >
            Go to the runs
            <Icon name="chevron" size={12} />
          </Link>
        </main>
      </div>
    </AppShell>
  );
}
