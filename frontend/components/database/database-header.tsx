import Link from "next/link";

import { TopBar } from "@/components/shell/top-bar";
import { Icon } from "@/components/ui/icons";

/**
 * The breadcrumb, the segmented control, and the count.
 *
 * The control is what says the two halves are one page. Two links styled as a
 * switch rather than a button with state: which half you are reading is in the
 * URL, so it is shareable, back works, and a reload lands where you were.
 */

interface DatabaseHeaderProps {
  runId: string;
  view: "rows" | "things";
  crumbs: { label: string; href?: string; mono?: boolean }[];
  /** The href of the other half, keeping as much of where you are as still makes sense. */
  otherHref: string;
  count: string;
}

export function DatabaseHeader({ runId, view, crumbs, otherHref, count }: DatabaseHeaderProps) {
  return (
    <TopBar crumbs={crumbs}>
      <div className="flex h-7 items-center gap-0.5 rounded-md bg-active p-0.5">
        <Segment href={view === "things" ? "#" : otherHref} active={view === "things"}>
          As things
        </Segment>
        <Segment href={view === "rows" ? "#" : otherHref} active={view === "rows"}>
          As rows
        </Segment>
      </div>
      <span className="shrink-0 text-small text-ink-faint">{count}</span>
      <Link
        href={`/runs/${runId}/chat`}
        className="flex h-[30px] items-center gap-[7px] rounded-md border border-review-line px-2.5 text-small text-review hover:bg-review-tint"
      >
        <Icon name="chat" size={13} />
        Ask about this
      </Link>
    </TopBar>
  );
}

function Segment({ href, active, children }: { href: string; active: boolean; children: string }) {
  if (active) {
    return (
      <span aria-current="page" className="flex h-6 items-center rounded-sm bg-canvas px-2.5 text-caption font-medium text-ink">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className="flex h-6 items-center rounded-sm px-2.5 text-caption text-ink-tertiary hover:text-ink">
      {children}
    </Link>
  );
}
