export interface Choice {
  value: string;
  label: string;
  /** Shown on hover: a note about the choice. */
  hint?: string;
}

interface FieldProps {
  name: string;
  label: string;
  choices: Choice[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * A labelled dropdown. The label is sentence case at the caption size, sitting
 * above its value: the uppercase micro label this used to set was retired in
 * `05-design.md` section 5.1 as the first thing review read as shouty.
 */
export function Field({ name, label, choices, value, onChange, disabled }: FieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption text-ink-tertiary">{label}</span>
      <select
        name={name}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-hairline-strong bg-canvas px-2.5 text-strong text-ink transition-colors duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value} title={choice.hint}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );
}
