import type { SqlResult } from "@/lib/api/chat-agent-schemas";

/**
 * The query that produced the answer, and the rows that came back.
 *
 * Never collapsed by default. Showing the query is the product's answer to
 * "did it make that up", and hiding the strongest trust signal on the screen
 * behind a disclosure is spending it for nothing
 * (docs/design/screen-blueprints.md section 10).
 */

/** Enough to see the shape of an answer. The agent only ever saw 200 either. */
const SHOWN_ROWS = 50;

export function SqlBlock({ sql, result }: { sql: string; result: SqlResult | null }) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline">
      <pre className="overflow-x-auto bg-sunken px-3.5 py-2.5 font-mono text-mono-sm leading-5 text-ink-secondary">
        <code>{sql}</code>
      </pre>
      {result ? <ResultTable result={result} /> : null}
    </div>
  );
}

function ResultTable({ result }: { result: SqlResult }) {
  const rows = result.rows.slice(0, SHOWN_ROWS);
  return (
    <>
      <div className="flex h-8 items-center gap-2 border-t border-hairline px-3.5">
        <span className="text-caption text-ink-tertiary">
          {result.rowCount} {result.rowCount === 1 ? "row" : "rows"}, {result.durationMs} ms
        </span>
        {result.truncated ? (
          <span className="inline-flex h-[18px] items-center rounded-xs bg-differ-tint px-1.5 text-[10px] text-differ">
            cut for length
          </span>
        ) : null}
      </div>
      {rows.length > 0 ? (
        <div className="max-h-[260px] overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0">
              <tr className="bg-surface">
                {result.columns.map((column) => (
                  <th
                    key={column}
                    className="border-b border-hairline px-3 py-1.5 text-left font-mono text-mono-xs font-normal text-ink-tertiary"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-hairline-faint last:border-0">
                  {row.map((cell, column) => (
                    <td key={result.columns[column]} className="px-3 py-1.5 align-top">
                      <span className={`font-mono text-mono-xs ${cell === null ? "text-hairline-strong" : "text-ink"}`}>
                        {cell ?? "null"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="border-t border-hairline px-3.5 py-2.5 text-small text-ink-tertiary">
          It ran and returned nothing. That is an answer: there were none.
        </p>
      )}
      {result.rows.length > SHOWN_ROWS ? (
        <p className="border-t border-hairline px-3.5 py-2 text-caption text-ink-faint">
          The first {SHOWN_ROWS} of {result.rows.length} rows.
        </p>
      ) : null}
    </>
  );
}
