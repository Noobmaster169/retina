"use client";

import { Icon } from "@/components/ui/icons";
import type { ObjectTypeSummary, StoredValue } from "@/lib/api/ontology-schemas";

/**
 * The right rail of the Record tab: which of a record's values are shown.
 *
 * The canvas draws this as an object type configurator with an Add menu over
 * a stored value, a computed value, a count of a link and a value over time.
 * Three of those four are columns that do not exist yet, so the menu is drawn
 * and disabled with the reason on it rather than opened over choices that
 * would do nothing. The eyes are real: they hide and show the rows beside
 * them, which is the part of this control that has something to act on.
 */

interface ValueConfigProps {
  type: ObjectTypeSummary;
  values: StoredValue[];
  hidden: Set<string>;
  onToggle(key: string): void;
}

const ADD_MENU = [
  { badge: "abc", label: "Stored value" },
  { badge: "fx", label: "Computed value" },
  { badge: "n", label: "Count of a link" },
  { badge: "ts", label: "Value over time" },
];

export function ValueConfig({ type, values, hidden, onToggle }: ValueConfigProps) {
  return (
    <aside
      aria-label="Which values are shown"
      className="hidden w-[360px] shrink-0 flex-col border-l border-hairline bg-surface xl:flex"
    >
      <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-hairline px-4">
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-sm bg-match-tint">
          <Icon name="mail" size={11} className="text-match" />
        </span>
        <span className="min-w-0">
          <span className="block text-heading font-medium">{type.label}</span>
          <span className="block text-caption text-ink-faint">{type.count.toLocaleString()} objects</span>
        </span>
      </header>

      <div className="flex h-[38px] shrink-0 items-stretch gap-[18px] border-b border-hairline px-4">
        <span className="flex items-center text-strong font-medium text-ink shadow-[inset_0_-2px_0_0_var(--ink)]">Columns</span>
        <span className="flex items-center text-strong text-ink-faint" title="Link configuration arrives with the write path">
          Links
        </span>
        <span className="flex items-center text-strong text-ink-faint" title="Rules arrive with the lesson gate, in phase 11">
          Rules
        </span>
      </div>

      <div className="px-4 pt-3.5">
        <div className="flex items-center gap-2">
          <span className="text-caption font-semibold tracking-[0.04em] text-ink-tertiary uppercase">Columns</span>
          <span className="grow" />
          <button
            type="button"
            disabled
            title="A computed value, a link count and a value over time are not stored yet"
            className="h-6 rounded-sm bg-signal-tint px-2.5 text-caption font-medium text-signal disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-faint"
          >
            Add
          </button>
        </div>

        <ul className="mt-1.5">
          {values.map((value) => {
            const off = hidden.has(value.key);
            return (
              <li key={value.key}>
                <button
                  type="button"
                  onClick={() => onToggle(value.key)}
                  className="flex h-8 w-full items-center gap-2.5 rounded-sm text-left hover:bg-sunken"
                  aria-pressed={!off}
                >
                  <span className="inline-flex h-4 min-w-[28px] shrink-0 items-center justify-center rounded-xs bg-active px-1.5 font-mono text-[9.5px] font-medium text-ink-tertiary">
                    {value.valueType}
                  </span>
                  <span className={`min-w-0 grow truncate text-small ${off ? "text-ink-faint" : "text-ink-secondary"}`}>
                    {value.key}
                  </span>
                  <Icon name="eye" size={13} className={off ? "text-ink-faint line-through" : "text-ink-tertiary"} />
                  <span className="sr-only">{off ? "show" : "hide"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grow" />
      <div className="border-t border-hairline px-4 py-3.5">
        <p className="text-caption leading-[17px] text-ink-tertiary">
          A derived column is computed when you ask for it. It is never stored, so it can never go stale.
        </p>
        <ul className="mt-2.5">
          {ADD_MENU.map((entry) => (
            <li key={entry.label} className="flex h-[26px] items-center gap-2.5">
              <span className="inline-flex h-4 min-w-[24px] shrink-0 items-center justify-center rounded-xs bg-active px-1 font-mono text-[9.5px] font-medium text-ink-faint">
                {entry.badge}
              </span>
              <span className="text-small text-ink-faint">{entry.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
