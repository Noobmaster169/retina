"use client";

import { ThinkingMark } from "@/components/chat/status-line";
import { HUE_CLASSES, kindOf } from "@/components/business/kind";
import { Icon } from "@/components/ui/icons";

import { useDock } from "./dock-state";
import { attached, keyOf, offered, type OfferedRef } from "./page-context";

/**
 * The harness. Each chip is one thing the page is about, in its kind's hue;
 * a filled chip goes with the next question, an outlined one stays behind.
 * The pin keeps a chip after the page changes, which is how a company is
 * compared with another one.
 */
export function ContextStrip() {
  const dock = useDock();
  const chips = offered(dock.page, dock.pinned);
  const sent = new Set(attached(dock.page, dock.pinned, dock.off).map(keyOf));
  if (chips.length === 0) return null;

  return (
    <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 border-t border-hairline px-[18px] py-2">
      <span className="inline-flex items-center gap-1.5 text-micro text-ink-tertiary">
        {dock.pageLoading ? <ThinkingMark /> : null}
        Reading
      </span>
      {dock.pageLoading ? <LoadingChip /> : null}
      {chips.map((ref) => (
        <ContextChip
          key={keyOf(ref)}
          item={ref}
          on={sent.has(keyOf(ref))}
          pinned={dock.pinned.some((r) => keyOf(r) === keyOf(ref))}
        />
      ))}
    </div>
  );
}

const PLAIN = { text: "text-ink-secondary", tint: "bg-sunken", border: "border-hairline-strong" };

function LoadingChip() {
  return <span className="inline-flex h-[24px] w-[120px] animate-pulse rounded-sm bg-sunken" aria-hidden />;
}

function ContextChip({ item, on, pinned }: { item: OfferedRef; on: boolean; pinned: boolean }) {
  const dock = useDock();
  const kind = item.kind === "run" || item.kind === "email" ? null : kindOf(item.kind);
  const hue = kind ? HUE_CLASSES[kind.hue] : PLAIN;
  return (
    <span
      className={`inline-flex h-[24px] items-center gap-1 rounded-sm border pl-1.5 pr-1 text-caption font-medium ${
        on ? `${hue.tint} ${hue.text} ${hue.border}` : "border-hairline bg-canvas text-ink-faint line-through"
      }`}
    >
      <button
        type="button"
        onClick={() => dock.toggle(item)}
        aria-pressed={on}
        title={on ? "Leave this out of the next question" : "Send this with the next question"}
        className="flex items-center gap-1"
      >
        {kind ? <Icon name={kind.icon} size={11} /> : null}
        <span className="max-w-[160px] truncate">{item.title}</span>
      </button>
      <button
        type="button"
        onClick={() => (pinned ? dock.unpin(item) : dock.pin(item))}
        aria-pressed={pinned}
        title={pinned ? "Unpin: drop it when the page changes" : "Pin: keep it when the page changes"}
        className={`flex h-4 w-4 items-center justify-center rounded-xs ${pinned ? "opacity-100" : "opacity-40 hover:opacity-80"}`}
      >
        <Icon name="clip" size={10} />
      </button>
    </span>
  );
}
