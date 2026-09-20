import type { Metadata } from "next";

import { Placeholder } from "@/components/shell/placeholder";

export const metadata: Metadata = { title: "Inbox · Retina SDOC" };

export default function InboxPage() {
  return (
    <Placeholder
      active="inbox"
      icon="mail"
      title="Inbox"
      crumbs={["Inbox"]}
      phase="phase 8"
      blurb="Every email the source has handed over, across runs, rather than the list scoped to one run."
      holds={[
        "The 86px mail rows the email page already lists down its left edge, unscoped from a single run.",
        "Differences, Needs you and All, and the saved views a person keeps beside them.",
        "One click through to the email page, which is built.",
      ]}
    >
      <p className="mt-4 max-w-[560px] text-small leading-[18px] text-ink-tertiary">
        A run&apos;s emails are listed today on the run page, and each one opens the email page from there.
      </p>
    </Placeholder>
  );
}
