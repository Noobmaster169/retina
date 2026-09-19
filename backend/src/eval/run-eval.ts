/**
 * pnpm eval:score --run <id> [--holdout] [--json]
 * Scores a run here, against the answer key, and writes eval/reports/<run>.json.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

import type { Scoreboard } from "../contracts";
import { closePool, getPool } from "../db";
import { TerminalError } from "../lib/errors";
import { splitPath } from "./id-lists";
import { evaluateRun } from "./report";
import { CATEGORIES } from "./score";

const { values } = parseArgs({
  options: { run: { type: "string" }, holdout: { type: "boolean", default: false }, json: { type: "boolean", default: false } },
});
if (!values.run) throw new TerminalError("usage: pnpm eval:score --run <id> [--holdout] [--json]");

const f = (n: number) => n.toFixed(4);

function lines(title: string, board: Scoreboard): string[] {
  const out = [
    `${title}  (${board.n_emails} emails)`,
    `  final score        ${f(board.final_score)}`,
    `  stage 1 macro-F1   ${f(board.stage1.macro_f1)}   accuracy ${f(board.stage1.accuracy)}`,
    `  stage 3 defect-F1  ${f(board.stage3.defect_f1)}   over ${board.stage3.doc_total} comparable emails`,
    `  end to end         ${f(board.end_to_end.rate)}   ${board.end_to_end.success} of ${board.end_to_end.total} defects`,
    `  escalation         recall ${f(board.reliability.escalation_recall)}  precision ${f(board.reliability.escalation_precision)}`,
    "  confusion (rows are the truth, columns the prediction)",
    `    ${"".padEnd(14)}${CATEGORIES.map((c) => c.slice(0, 9).padStart(10)).join("")}`,
  ];
  for (const actual of CATEGORIES) {
    const row = board.stage1.confusion[actual] ?? {};
    out.push(`    ${actual.padEnd(14)}${CATEGORIES.map((c) => String(row[c] ?? 0).padStart(10)).join("")}`);
  }
  return out;
}

const report = await evaluateRun(getPool(), values.run);
await closePool();

const reportPath = join(dirname(splitPath()), "reports", `${values.run}.json`);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (values.json) {
  process.stdout.write(`${JSON.stringify(report)}\n`);
} else {
  const boards: [string, Scoreboard][] = values.holdout
    ? [["HOLDOUT", report.holdout]]
    : [["THIS RUN'S EMAILS", report.run], ["HOLDOUT", report.holdout], ["FULL INBOX, as the organisers' scorer sees it", report.full]];
  const text = boards.flatMap(([title, board]) => [...lines(title, board), ""]);
  text.push(`wrong category: ${report.wrong.stage1.join(" ") || "none"}`, `report: ${reportPath}`);
  process.stdout.write(`${text.join("\n")}\n`);
}
