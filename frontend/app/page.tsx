import { redirect } from "next/navigation";

/**
 * Retina opens on its runs. There is no separate landing page: the product is
 * the pipeline and the work it did, and every other destination in the rail is
 * reached from the same shell.
 */
export default function Home() {
  redirect("/runs");
}
