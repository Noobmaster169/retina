import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReviewPage } from "./review-page";

export const dynamic = "force-dynamic";

const RUN_ID = /^[0-9a-f-]{36}$/;

export async function generateMetadata({ params }: PageProps<"/runs/[id]/review">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Needs a person ${id.slice(0, 8)} · Retina SDOC` };
}

/** Every case of one run that is waiting for a person, and whichever one is open. */
export default async function Page({ params }: PageProps<"/runs/[id]/review">) {
  const { id } = await params;
  if (!RUN_ID.test(id)) notFound();
  return <ReviewPage runId={id} />;
}
