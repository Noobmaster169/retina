import { CardGridTemplate } from "@/components/business/card-template";
import { LIST_COPY } from "@/components/business/list-copy";
import { ListTemplate } from "@/components/shell/page-skeleton";

export default function Loading() {
  return (
    <ListTemplate copy={LIST_COPY.company}>
      <CardGridTemplate type="party" />
    </ListTemplate>
  );
}
