import { redirect } from "next/navigation";

import { login } from "@/app/actions/auth";
import { gateEnabled, hasSiteAccess } from "@/lib/site-gate";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!gateEnabled() || (await hasSiteAccess())) redirect("/chat");
  const { error } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-sm px-5 py-16">
      <h1 className="text-xl font-semibold">Password required</h1>
      <p className="mt-1 text-sm text-muted">Asking a model spends the shared subscription, so that page needs the site password.</p>
      <form action={login} className="mt-6 flex flex-col gap-4">
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
