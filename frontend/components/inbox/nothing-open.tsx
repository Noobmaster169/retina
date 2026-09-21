import { TopBar } from "@/components/shell/top-bar";
import { Icon } from "@/components/ui/icons";

/**
 * The middle column with no email open. An empty panel gets replaced, not
 * padded: it says what the run holds rather than standing in for a message.
 */

interface NothingOpenProps {
  runId: string;
  /** An email is chosen and its reading has not arrived, which is a different sentence from nothing chosen. */
  chosen: boolean;
  loading: boolean;
  waiting: number;
  onBack: () => void;
  className?: string;
}

export function NothingOpen({ runId, chosen, loading, waiting, onBack, className = "" }: NothingOpenProps) {
  return (
    <div className={`min-w-0 grow flex-col ${className}`}>
      <TopBar
        crumbs={[{ label: "Runs", href: "/runs" }, { label: runId.slice(0, 8), href: `/runs/${runId}`, mono: true }, { label: "Inbox" }]}
        onBack={chosen ? onBack : undefined}
      />
      <div className="flex min-h-0 grow flex-col items-center justify-center px-6">
        <Icon name="mail" size={22} className="text-ink-faint" />
        <p className="mt-3 max-w-[46ch] text-center text-body text-ink-tertiary">{line(chosen, loading, waiting)}</p>
      </div>
    </div>
  );
}

function line(chosen: boolean, loading: boolean, waiting: number): string {
  if (chosen) return loading ? "Reading the email." : "That email is not in this run. Choose another from the list.";
  if (waiting > 0) {
    return `Choose a message to read it, the seam under it, and what Retina made of the two documents. ${waiting} ${
      waiting === 1 ? "is" : "are"
    } waiting for a person.`;
  }
  return "Choose a message to read it, the seam under it, and what Retina made of the two documents.";
}
