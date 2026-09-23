import { Icon } from "@/components/ui/icons";

/** The report tab's title row and the way into the printable export. */
export function ReportHeader({
  title,
  subtitle,
  runId,
  emailId,
}: {
  title: string;
  subtitle: string;
  runId: string;
  emailId: string;
}) {
  return (
    <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-hairline px-3 py-2">
      <span className="min-w-0">
        <span className="block text-strong font-medium text-ink">{title}</span>
        <span className="block text-caption text-ink-tertiary">{subtitle}</span>
      </span>
      <span className="grow" />
      <ExportLink runId={runId} emailId={emailId} />
    </div>
  );
}

function ExportLink({ runId, emailId }: { runId: string; emailId: string }) {
  return (
    <a
      href={`/report/${runId}/${emailId}?print=1`}
      target="_blank"
      rel="noreferrer"
      title="Open a shareable report to print or save as PDF"
      className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md bg-accent px-3 text-strong font-medium text-ink-inverse transition-opacity duration-150 hover:opacity-85"
    >
      <Icon name="doc" size={13} />
      Export report
    </a>
  );
}
