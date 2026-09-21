import { LIST_COPY } from "@/components/business/list-copy";
import { Bar, ListTemplate } from "@/components/shell/page-skeleton";

/**
 * The map, because that is the view a port list opens in. Which view is
 * actually on is remembered in the browser, which the server cannot read, so
 * the shell draws the one a person sees the first time.
 */
export default function Loading() {
  return (
    <ListTemplate copy={LIST_COPY.port}>
      <Bar className="h-[420px] w-full rounded-lg" />
    </ListTemplate>
  );
}
