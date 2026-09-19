export interface Choice {
  value: string;
  label: string;
  /** Shown on hover: a note about the choice. */
  hint?: string;
}

interface Props {
  name: string;
  label: string;
  choices: Choice[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** A labelled dropdown in the new-run form's style. */
export function LabelledSelect({ name, label, choices, value, onChange, disabled }: Props) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <select
        name={name}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-line bg-paper px-3 py-2 text-sm focus:border-accent focus:bg-surface disabled:opacity-60"
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
