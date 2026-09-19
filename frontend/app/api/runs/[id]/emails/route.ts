import { Category, DecidedBy, listRunEmails } from "@/lib/api-client";
import { passThrough } from "@/lib/api-route";

/** The run's emails, one page at a time, with the filters the page offers. */
export async function GET(request: Request, ctx: RouteContext<"/api/runs/[id]/emails">) {
  const { id } = await ctx.params;
  const params = new URL(request.url).searchParams;
  const category = Category.safeParse(params.get("category"));
  const decidedBy = DecidedBy.safeParse(params.get("decidedBy"));
  return passThrough("list run emails", () =>
    listRunEmails(id, {
      stage: params.get("stage") ?? undefined,
      category: category.success ? category.data : undefined,
      decidedBy: decidedBy.success ? decidedBy.data : undefined,
      q: params.get("q") ?? undefined,
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 50),
    }),
  );
}
