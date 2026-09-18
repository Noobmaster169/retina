import { redirect } from "next/navigation";

import { login } from "@/app/actions/auth";
import { gateEnabled, hasSiteAccess, safeNext } from "@/lib/site-gate";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  const destination = safeNext(next);
  if (!gateEnabled() || (await hasSiteAccess())) redirect(destination);

  return (
    <main className="mx-auto w-full max-w-sm px-5 py-16">
      <h1 className="text-xl font-semibold">Password required</h1>
      <p className="mt-1 text-sm text-muted">Asking a model and starting a run both spend shared resources, so those pages need the site password.</p>
      <form action={login} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="next" value={destination} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Password</span>
          <input
            type="password"
            name="password"
            required
            autoFocus
            autoComplete="current-password"
            className="rounded-lg border border-line bg-surface px-3 py-2 outline-none focus:border-brand"
          />
        </label>
        {error && <p className="text-sm text-red-700">Wrong password.</p>}
        <button
          type="submit"
          className="self-start rounded-lg border border-brand-ink/25 bg-brand px-3.5 py-2 text-sm font-medium text-white"
        >
          Enter
        </button>
      </form>
    </main>
  );
}
