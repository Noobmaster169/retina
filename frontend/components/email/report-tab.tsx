"use client";

import { useState } from "react";

import type { DocumentView, EmailTrace } from "@/lib/api/trace-schemas";

import { ComparisonReportTable } from "./comparison-report-table";
import { DocumentSheet } from "./document-sheet";
import { hasReport, wrongDocType } from "./report-eligible";
import { ReportHeader } from "./report-header";
import { ReportVerdict } from "./report-verdict";
import type { FieldRowData } from "./field-row";
import { WrongDocumentReport } from "./wrong-document-report";

/**
 * The report: every field, its value in each document, and how it was judged;
 * or, when the check stopped on document type, what each file claimed to be.
 */

interface ReportTabProps {
  runId: string;
  trace: EmailTrace;
  rows: FieldRowData[];
}

export function ReportTab({ runId, trace, rows }: ReportTabProps) {
  const wrongDocument = wrongDocType(trace) && rows.length === 0;
  const [selected, setSelected] = useState(trace.comparison?.defectFields[0] ?? rows[0]?.judgement.field ?? null);
  const [previewing, setPreviewing] = useState<DocumentView | null>(null);
  const si = trace.documents.find((document) => document.role === "SI");
  const bl = trace.documents.find((document) => document.role === "BL");
  const chosen = rows.find((row) => row.judgement.field === selected);

  if (!hasReport(trace)) return null;

  if (wrongDocument) {
    return (
      <div className="flex min-h-0 grow flex-col">
        <ReportHeader
          title="Document type report"
          subtitle="A file was not the document its name claims"
          runId={runId}
          emailId={trace.emailId}
        />
        <WrongDocumentReport trace={trace} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 grow flex-col">
      <ReportHeader
        title="Comparison report"
        subtitle={`${rows.length} field${rows.length === 1 ? "" : "s"} reviewed`}
        runId={runId}
        emailId={trace.emailId}
      />

      <ReportVerdict chosen={chosen} />

      <ComparisonReportTable
        rows={rows}
        si={si}
        bl={bl}
        selected={selected}
        onSelect={setSelected}
        onPreview={setPreviewing}
      />

      {previewing ? <DocumentSheet document={previewing} onClose={() => setPreviewing(null)} /> : null}
    </div>
  );
}
