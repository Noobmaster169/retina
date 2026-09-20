"use client";

import Link from "next/link";
import { motion } from "motion/react";

import { Chip, toneOf } from "@/components/ui/chip";
import type { RunEmailItem } from "@/lib/api/trace-schemas";
import { stagger } from "@/lib/motion";

/**
 * The run's emails, 300px wide, one row per email at 86px. That is the one
 * list in the product drawn at this height: a mail row carries a sender, a
 * subject, an id and two chips, and forty of those at 36px would be unreadable
 * even though density is the courtesy everywhere else.
 *
 * The category chip is neutral. Colouring five categories would spend the
 * hues that status needs and make 520 rows a rainbow: section 4.9.
 */

export interface ListTab {
  value: string;
  label: string;
  count: number;
}

interface EmailListProps {
  runId: string;
  emails: RunEmailItem[];
  selectedId: string;
  tabs: ListTab[];
  active: string;
  onTab: (value: string) => void;
}

export function EmailList({ runId, emails, selectedId, tabs, active, onTab }: EmailListProps) {
  return (
    <div className="flex w-[300px] shrink-0 flex-col border-r border-hairline">
      <div className="flex h-14 shrink-0 items-center px-[18px]">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em]">Inbox</h2>
      </div>
      <div className="flex h-[38px] shrink-0 items-stretch gap-4 border-b border-hairline px-[18px]">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onTab(tab.value)}
            className={`relative flex items-center gap-1.5 text-strong transition-colors duration-150 ${
              tab.value === active ? "font-medium text-ink" : "text-ink-secondary"
            }`}
          >
            <span>{tab.label}</span>
            <span className="text-caption text-ink-faint">{tab.count}</span>
            {tab.value === active ? (
              <motion.span
                layoutId="email-list-tab"
                transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                className="absolute inset-x-0 -bottom-px h-0.5 bg-ink"
                aria-hidden="true"
              />
            ) : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 grow overflow-y-auto">
        {emails.length === 0 ? (
          <p className="px-[18px] py-4 text-small text-ink-tertiary">Nothing in this view.</p>
        ) : (
          emails.map((email, index) => (
            <motion.div key={email.emailId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={stagger(index)}>
              <Link
                href={`/runs/${runId}/emails/${email.emailId}`}
                aria-current={email.emailId === selectedId ? "page" : undefined}
                className={`block h-[86px] border-b border-hairline-faint px-[18px] py-3 transition-colors duration-150 hover:bg-sunken ${
                  email.emailId === selectedId ? "bg-active shadow-[inset_2px_0_0_0_var(--ink)]" : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-active text-[10px] font-semibold text-ink-secondary">
                    {initials(email.from)}
                  </span>
                  <span className="min-w-0 truncate text-strong font-medium">{name(email.from)}</span>
                </span>
                <span className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="shrink-0 font-mono text-mono-sm text-ink-faint">{email.emailId}</span>
                  <span className="min-w-0 truncate text-small text-ink-secondary">{email.subject}</span>
                </span>
                <span className="mt-2 flex items-center gap-1.5">
                  {email.category ? (
                    <Chip mono className="h-[19px] rounded-xs px-1.5">
                      {email.category}
                    </Chip>
                  ) : null}
                  {email.outcome ? (
                    <Chip tone={toneOf(email.outcome)} mono className="h-[19px] rounded-xs px-1.5">
                      {email.outcome}
                    </Chip>
                  ) : null}
                </span>
              </Link>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function address(from: string): string {
  return from.match(/<([^>]+)>/)?.[1] ?? from;
}

function name(from: string): string {
  const named = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (named) return named[1];
  const [, domain] = address(from).split("@");
  return domain?.split(".")[0] ?? address(from);
}

function initials(from: string): string {
  const words = name(from).split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "?").concat(words[1]?.[0] ?? "").toUpperCase();
}
