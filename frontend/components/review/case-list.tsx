"use client";

import { motion } from "motion/react";

import { Chip } from "@/components/ui/chip";
import type { ReviewCaseItem } from "@/lib/api/review-schemas";
import { stagger } from "@/lib/motion";

/**
 * The queue: every case waiting for a person, grouped under the reason that
 * raised it, with the jobs that failed in their own group at the foot. A
 * failure is not one of the organisers' four reasons and never sits among them.
 *
 * A case row is 46px and not the mail list's 86px. It is a case, not a
 * message: the reason and the age are what a person chooses on, and the
 * sender's initials are not.
 */

/** The organisers' four, in the order the escalation policy applies them. */
const ORDER = ["unreadable", "wrong_doc_type", "missing_attachment", "missing_value"] as const;

const HEADERS: Record<string, string> = {
  unreadable: "Could not be read",
  wrong_doc_type: "Not the document it claims",
  missing_attachment: "A document is not here",
  missing_value: "A value is blank",
  failure: "Stopped before it finished",
};

interface CaseListProps {
  cases: ReviewCaseItem[];
  selectedId: string | null;
  onSelect: (item: ReviewCaseItem) => void;
  /** Shown in place of the list while the first page is still arriving. */
  loading: boolean;
}

export function CaseList({ cases, selectedId, onSelect, loading }: CaseListProps) {
  const groups: { key: string; cases: ReviewCaseItem[] }[] = [
    ...ORDER.map((reason) => ({ key: reason as string, cases: cases.filter((one) => one.kind === "review" && one.reason === reason) })),
    // Failures last and on their own: a job that stopped is not one of the
    // organisers' reasons and never sits among them.
    { key: "failure", cases: cases.filter((one) => one.kind === "failure") },
  ];
  const shown = groups.filter((group) => group.cases.length > 0);

  return (
    <div className="flex w-[300px] shrink-0 flex-col border-r border-hairline">
      <div className="flex h-14 shrink-0 items-center border-b border-hairline px-[18px]">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em]">Needs a person</h2>
        <span className="grow" />
        <span className="font-mono text-mono-sm text-ink-tertiary tabular-nums">{cases.length}</span>
      </div>

      <div className="min-h-0 grow overflow-y-auto">
        {shown.length === 0 ? (
          <p className="px-[18px] py-4 text-small leading-5 text-ink-tertiary">
            {loading ? "Reading the queue." : "Nothing is waiting. Every email in this run either finished or is still moving."}
          </p>
        ) : (
          shown.map((group) => (
            <section key={group.key}>
              <h3 className="flex h-[26px] items-center bg-sunken px-[18px] text-caption text-ink-tertiary">
                {HEADERS[group.key] ?? group.key}
                <span className="grow" />
                <span className="tabular-nums">{group.cases.length}</span>
              </h3>
              {group.cases.map((item, index) => (
                <motion.button
                  key={item.id}
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={stagger(index)}
                  onClick={() => onSelect(item)}
                  aria-current={item.id === selectedId ? "true" : undefined}
                  className={`flex h-[46px] w-full items-center gap-2 border-b border-hairline-faint px-[18px] text-left transition-colors duration-150 hover:bg-sunken ${
                    item.id === selectedId ? "bg-active shadow-[inset_2px_0_0_0_var(--ink)]" : ""
                  }`}
                >
                  <span className="min-w-0 grow">
                    <span className="flex items-baseline gap-1.5">
                      <span className="shrink-0 font-mono text-mono-xs text-ink-faint">{item.emailId}</span>
                      <span className="min-w-0 truncate text-small text-ink-secondary">{item.subject}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <Chip tone={item.kind === "failure" ? "fault" : "review"} mono className="h-[17px] rounded-xs px-1.5 text-[10px]">
                        {item.reason ?? "failed"}
                      </Chip>
                      {item.actions > 0 ? (
                        <span className="truncate text-caption text-ink-tertiary">{item.lastActionBy} has been here</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-caption text-ink-faint tabular-nums">{age(item.openedAt)}</span>
                </motion.button>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/** How long it has been open, counted against this page's clock: `openedAt` is an instant for exactly this. */
function age(at: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(at)) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}
