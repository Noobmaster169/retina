"use client";

/**
 * The password a run is started with.
 *
 * Its own file for the line rule, and it earns one: this is the only control
 * on the page that is not a choice about the run. Everything beside it changes
 * what a run does; this one decides whether it happens at all.
 *
 * Deliberately a plain field and not a dialogue. A prompt that appears on
 * submit is a thing to dismiss, and the whole point is that starting a run is
 * typed rather than clicked.
 */
export function RunPassword({ value, onChange }: { value: string; onChange(value: string): void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption text-ink-tertiary">Password</span>
      <input
        name="run-password"
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        placeholder="to start a run"
        className="h-9 w-[150px] rounded-md border border-hairline-strong bg-canvas px-2.5 text-strong text-ink transition-colors duration-150 placeholder:text-ink-faint hover:border-ink"
      />
    </label>
  );
}
