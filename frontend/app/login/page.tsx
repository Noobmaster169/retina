import { redirect } from "next/navigation";

import { login } from "@/app/actions/auth";
import { Mark } from "@/components/ui/icons";
import { gateEnabled, hasSiteAccess, safeNext } from "@/lib/site-gate";

export const dynamic = "force-dynamic";

/**
 * The one page outside the shell, because there is no rail to show someone who
 * is not in yet. It still carries the mark, the display face and the Air
 * palette, so the first thing a person sees is the product and not a form.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  const destination = safeNext(next);
  if (!gateEnabled() || (await hasSiteAccess())) redirect(destination);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5">
          <Mark size={18} className="text-ink" />
          <span className="text-[14px] font-semibold tracking-[-0.01em]">Retina</span>
          <span className="text-small text-ink-tertiary">SDOC</span>
        </div>

        <h1 className="mt-6 font-display text-display font-normal tracking-[-0.01em]">Password required</h1>
        <p className="mt-0.5 text-body text-ink-tertiary">
          Starting a run and asking a model both spend shared resources, so Retina is behind one password.
        </p>

        <form action={login} className="mt-7 flex flex-col gap-4">
          <input type="hidden" name="next" value={destination} />
          <label className="flex flex-col gap-1">
            <span className="text-caption text-ink-tertiary">Password</span>
            <input
              type="password"
              name="password"
              required
              autoFocus
              autoComplete="current-password"
              aria-invalid={error ? true : undefined}
              className={`h-10 rounded-md border bg-canvas px-3 text-body text-ink outline-none transition-colors duration-150 ${
                error ? "border-fault" : "border-hairline-strong hover:border-ink"
              }`}
            />
          </label>
          {error ? (
            <p role="alert" className="border-l-2 border-fault pl-3 text-small text-fault">
              Wrong password.
            </p>
          ) : null}
          <button
            type="submit"
            className="h-[34px] self-start rounded-md bg-ink px-4 text-strong font-medium text-ink-inverse transition-opacity duration-150 hover:opacity-90"
          >
            Enter
          </button>
        </form>
      </div>
    </main>
  );
}
