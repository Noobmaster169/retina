"use client";

import type { MouseEvent } from "react";

import { senderInitials, senderName } from "@/components/email/sender";
import { Chip, toneOf } from "@/components/ui/chip";

import { FilterBar } from "./filter-bar";
import type { FilterKey, InboxView } from "./inbox-filters";
import type { InboxRow } from "./inbox-rows";

/**
 * Every email of the run, one row at 86px. That is the one list in the product
 * drawn at this height: a mail row carries a sender, a subject, an id and two
 * chips, and forty of those at 36px would be unreadable even though density is
 * the courtesy everywhere else.
 *
 * A row is a link that usually does not navigate. Plain click chooses the
 * email in place, which is what keeps one pane on screen instead of a new one
 * per click; a click with a modifier is left alone, so the middle button still
 * opens an email in its own tab.
 *
 * No per-row animation. The staggered entrance belongs to a list that paints
 * once, and this one re-narrows on every keystroke, where five hundred
 * animating rows is the cost nobody sees but everybody feels.
 */

interface InboxListProps {
  rows: InboxRow[];
  /** Every email of the run, which the header states even while a chip is narrowing the list. */
  total: number;
  selectedId: string | null;
  onSelect: (emailId: string) => void;
  view: InboxView;
  onView: (next: Partial<InboxView>) => void;
  counts: Record<FilterKey, number>;
  loading: boolean;
  className?: string;
}

export function InboxList({ rows, total, selectedId, onSelect, view, onView, counts, loading, className = "" }: InboxListProps) {
  return (
    <div className={`w-full shrink-0 flex-col border-r border-hairline md:w-[300px] ${className}`}>
      <div className="flex h-14 shrink-0 items-center px-[18px]">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em]">Inbox</h2>
        <span className="grow" />
        <span className="font-mono text-mono-sm text-ink-tertiary tabular-nums">{total}</span>
      </div>

      <FilterBar view={view} onView={onView} counts={counts} shown={rows.length} />

      <div className="min-h-0 grow overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-[18px] py-4 text-small leading-5 text-ink-tertiary">{nothing(loading, view, total)}</p>
        ) : (
          rows.map((row) => <Row key={row.emailId} row={row} selected={row.emailId === selectedId} onSelect={onSelect} />)
        )}
      </div>
    </div>
  );
}

function Row({ row, selected, onSelect }: { row: InboxRow; selected: boolean; onSelect: (emailId: string) => void }) {
  const status = row.openCase ? (row.openCase.reason ?? "failed") : (row.outcome ?? row.stage);

  function choose(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onSelect(row.emailId);
  }

  return (
    <a
      href={`?email=${row.emailId}`}
      onClick={choose}
      aria-current={selected ? "page" : undefined}
      className={`block h-[86px] border-b border-hairline-faint px-[18px] py-3 transition-colors duration-150 hover:bg-sunken ${
        selected ? "bg-active shadow-[inset_2px_0_0_0_var(--ink)]" : ""
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-active text-[10px] font-semibold text-ink-secondary">
          {senderInitials(row.from)}
        </span>
        <span className="min-w-0 grow truncate text-strong font-medium">{senderName(row.from)}</span>
        {row.openCase ? <Waiting openCase={row.openCase} /> : null}
      </span>
      <span className="mt-1.5 flex items-baseline gap-1.5">
        <span className="shrink-0 font-mono text-mono-sm text-ink-faint">{row.emailId}</span>
        <span className="min-w-0 truncate text-small text-ink-secondary">{row.subject}</span>
      </span>
      <span className="mt-2 flex items-center gap-1.5">
        <Chip tone={toneOf(status)} mono className="h-[19px] rounded-xs px-1.5">
          {status}
        </Chip>
        {row.category ? (
          <Chip mono className="h-[19px] min-w-0 rounded-xs px-1.5">
            <span className="truncate">{row.category}</span>
          </Chip>
        ) : null}
      </span>
    </a>
  );
}

/** How long this case has been open, and whether anyone has been to it. The sentence itself is one hover away. */
function Waiting({ openCase }: { openCase: NonNullable<InboxRow["openCase"]> }) {
  const seen = openCase.actions > 0;
  return (
    <span
      title={seen ? `${openCase.lastActionBy ?? "Someone"} has been here` : "Nobody has been to this yet"}
      className="shrink-0 text-caption text-ink-faint tabular-nums"
    >
      {age(openCase.openedAt)}
      {seen ? " · seen" : ""}
    </span>
  );
}

/** Counted against this page's clock: `openedAt` is an instant for exactly this. */
function age(at: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(at)) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function nothing(loading: boolean, view: InboxView, total: number): string {
  if (loading) return "Reading the run.";
  if (total === 0) return "This run has no emails yet. They arrive as ingest hands them over.";
  if (view.query) return `Nothing in this run matches "${view.query}".`;
  return "Nothing is in this view. Another chip will have it.";
}
