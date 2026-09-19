import { getEvalReport } from "@/lib/api-client";
import { hasSiteAccess } from "@/lib/site-gate";

/** Dev only. 404 wherever the backend has no answer key, and the page hides the readout. */
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]/eval">) {
  if (!(await hasSiteAccess())) {
    return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const report = await getEvalReport(id);
    if (!report) return Response.json({ error: "not available" }, { status: 404 });
    // The wrong-id lists and confusion matrices stay on the server; the page shows the headline only.
    const headline = (board: typeof report.full) => ({
      finalScore: board.final_score,
      stage1MacroF1: board.stage1.macro_f1,
      endToEndRate: board.end_to_end.rate,
      nEmails: board.n_emails,
    });
    return Response.json({ run: headline(report.run), holdout: headline(report.holdout), wrongCategory: report.wrong.stage1.length });
  } catch (error) {
    console.error("[api/runs] eval failed:", error);
    return Response.json({ error: "Could not reach the backend." }, { status: 503 });
  }
}
