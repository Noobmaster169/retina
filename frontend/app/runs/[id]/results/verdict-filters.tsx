"use client";

import type { ReactNode } from "react";

import type { Category, EmailVerdict, VerifierEffect } from "@/lib/api/scoring-schemas";

import { CHECK_NAMES, checkCounts, effectCounts, type Filters } from "./filters";
import { CHECK_LABELS, EFFECTS } from "./verdict-reading";

/**
 * Every way of narrowing the table to one kind of failure, because a prompt is
 * changed against one kind at a time. Each chip says what it would show, so a
 * count of zero is visible before it is clicked rather than after.
 */

const CATEGORIES: Category[] = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"];

interface FiltersProps {
  verdicts: EmailVerdict[];
  filters: Filters;
  onChange: (next: Filters) => void;
}

export function VerdictFilters({ verdicts, filters, onChange }: FiltersProps) {
  const checks = checkCounts(verdicts);
  const effects = effectCounts(verdicts);
  const set = (part: Partial<Filters>) => onChange({ ...filters, ...part });

  return (
    <div className="border-y border-hairline bg-surface px-4 py-3">
      <Row label="Wrong on">
        {CHECK_NAMES.map((name) => (
          <Toggle
            key={name}
            on={filters.check === name}
            onClick={() => set({ check: filters.check === name ? null : name, outcome: "all" })}
            count={checks[name]}
          >
            {CHECK_LABELS[name]}
          </Toggle>
        ))}
        <span className="mx-1 h-4 w-px bg-hairline" aria-hidden="true" />
        <Toggle
          on={filters.outcome === "wrong"}
          onClick={() => set({ outcome: filters.outcome === "wrong" ? "all" : "wrong", check: null })}
        >
          anything at all
        </Toggle>
        <Toggle
          on={filters.outcome === "right"}
          onClick={() => set({ outcome: filters.outcome === "right" ? "all" : "right", check: null })}
        >
          nothing, the clean ones
        </Toggle>
      </Row>

      <Row label="The verifier">
        {(Object.keys(EFFECTS) as VerifierEffect[]).map((effect) => (
          <Toggle
            key={effect}
            on={filters.effect === effect}
            onClick={() => set({ effect: filters.effect === effect ? null : effect })}
            count={effects[effect] ?? 0}
            tone={EFFECTS[effect].tone === "fault" ? "fault" : undefined}
          >
            {EFFECTS[effect].label}
          </Toggle>
        ))}
      </Row>

      <Row label="Category">
        <Select
          value={filters.truth ?? ""}
          onChange={(value) => set({ truth: (value || null) as Category | null })}
          label="truth is"
          options={CATEGORIES}
        />
        <Select
          value={filters.answer ?? ""}
          onChange={(value) => set({ answer: (value || null) as Category | null })}
          label="answered"
          options={CATEGORIES}
        />
        <span className="mx-1 h-4 w-px bg-hairline" aria-hidden="true" />
        {(["all", "train", "holdout"] as const).map((split) => (
          <Toggle key={split} on={filters.split === split} onClick={() => set({ split })}>
            {split === "all" ? "both splits" : split}
          </Toggle>
        ))}
        <span className="grow" />
        <input
          value={filters.q}
          onChange={(event) => set({ q: event.target.value })}
          placeholder="email id"
          aria-label="Filter by email id"
          className="h-7 w-[9.5rem] rounded-md border border-hairline bg-canvas px-2 font-mono text-mono-xs outline-none placeholder:text-ink-faint focus:border-hairline-strong"
        />
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      <span className="w-[5.5rem] shrink-0 text-caption text-ink-tertiary">{label}</span>
      {children}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  count,
  tone,
  children,
}: {
  on: boolean;
  onClick: () => void;
  count?: number;
  tone?: "fault";
  children: ReactNode;
}) {
  const quiet = count === 0 && !on;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex h-[26px] items-center gap-1.5 rounded-sm border px-2 text-caption transition-colors ${
        on
          ? "border-transparent bg-[var(--ink)] text-[var(--canvas)]"
          : `border-hairline bg-canvas hover:border-hairline-strong ${quiet ? "text-ink-faint" : "text-ink-secondary"}`
      }`}
    >
      <span className={tone === "fault" && !on && count ? "text-fault" : ""}>{children}</span>
      {count === undefined ? null : <span className="font-mono text-mono-xs tabular-nums opacity-70">{count}</span>}
    </button>
  );
}

function Select({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <label className="inline-flex h-[26px] items-center gap-1.5 rounded-sm border border-hairline bg-canvas pl-2 text-caption text-ink-secondary">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full rounded-r-sm bg-transparent pr-1.5 font-mono text-mono-xs outline-none"
      >
        <option value="">any</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}