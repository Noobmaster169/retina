import type { ReactNode } from "react";

/**
 * A panel is a 1px hairline rectangle on the white page. There are no cards in
 * Retina and there is one shadow in the whole product, which this is not:
 * docs/05-design.md section 6 says panels are bordered, not floated.
 */

interface PanelProps {
  children: ReactNode;
  className?: string;
}

export function Panel({ children, className = "" }: PanelProps) {
  return <section className={`flex min-h-0 flex-col rounded-xl border border-hairline ${className}`}>{children}</section>;
}

interface PanelHeadProps {
  title: ReactNode;
  /** Sits to the right of the title, at rest. A count, a state, a timestamp. */
  aside?: ReactNode;
  /** Sits immediately after the title in secondary ink: the sentence that says what the panel is for. */
  note?: ReactNode;
  icon?: ReactNode;
}

export function PanelHead({ title, aside, note, icon }: PanelHeadProps) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 px-4">
      {icon}
      <h2 className="text-[14px] font-semibold tracking-[-0.01em]">{title}</h2>
      {note ? <span className="min-w-0 truncate text-small text-ink-tertiary">{note}</span> : null}
      <span className="grow" />
      {aside}
    </header>
  );
}

/** The strip along a panel's foot: one link, one sentence, or one pair of controls. */
export function PanelFoot({ children, className = "" }: PanelProps) {
  return <footer className={`shrink-0 border-t border-hairline px-4 py-3 ${className}`}>{children}</footer>;
}

/**
 * A proportion along a row. Section 4.8 leaves one chart standing, the run's
 * outcomes; everywhere else a count is a number and a share is one of these.
 */
export function Bar({ pct, tone = "ink", height = 5 }: { pct: number; tone?: string; height?: number }) {
  return (
    <span
      className="relative block min-w-0 grow overflow-hidden rounded-full bg-sunken"
      style={{ height }}
      aria-hidden="true"
    >
      <span
        className="absolute left-0 top-0 rounded-full transition-[width] duration-[1100ms] ease-out"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height, background: tone }}
      />
    </span>
  );
}
