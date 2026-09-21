import { z } from "zod";

/**
 * One probe per dependency reached over HTTP, and what each one is worth
 * asking.
 *
 * They live apart from health.ts because that file is about what a reading
 * means and this one is about how each service answers. Each returns the
 * detail worth reporting, or throws, and health.ts turns either into a check.
 *
 * They are gathered behind `Probes` for the usual reason: a health test that
 * dialled the real proxy and the real inbox would be a test of whoever is
 * running on port 8000 today, and `CLAUDE.md` bans a test from reaching the
 * proxy at all.
 *
 * Every payload is parsed. A dependency whose health endpoint changed shape
 * should read as up with less detail, never as an exception in a route whose
 * whole job is to not have one.
 */

/** The three checks that are an HTTP call. One interface, one real implementation, one fake per test. */
export interface Probes {
  inbox(): Promise<{ emails?: number; scoringAvailable?: boolean }>;
  docExtract(): Promise<Record<string, never>>;
  llmProxy(): Promise<{ models?: number }>;
}

interface ProbeUrls {
  EMAIL_SERVER_URL: string;
  DOC_EXTRACT_URL: string;
  LLM_PROXY_URL: string;
}

/** The real ones, against the urls config holds. */
export function httpProbes(urls: ProbeUrls, timeoutMs: number): Probes {
  return {
    inbox: () => probeInbox(urls.EMAIL_SERVER_URL, timeoutMs),
    docExtract: () => probeDocExtract(urls.DOC_EXTRACT_URL, timeoutMs),
    llmProxy: () => probeLlmProxy(urls.LLM_PROXY_URL, timeoutMs),
  };
}

async function readJson(url: string, timeoutMs: number, what: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${what} returned ${response.status}`);
  return response.json();
}

const trimmed = (url: string) => url.replace(/\/+$/, "");

const InboxHealth = z.object({ emails: z.number().optional(), scoring_available: z.boolean().optional() });

/** The Averis server. `emails: 0` is the bind mount that came up empty, which otherwise looks like a healthy empty inbox. */
export async function probeInbox(baseUrl: string, timeoutMs: number): Promise<{ emails?: number; scoringAvailable?: boolean }> {
  const body = InboxHealth.safeParse(await readJson(`${trimmed(baseUrl)}/health`, timeoutMs, "inbox /health"));
  if (!body.success) return {};
  return { emails: body.data.emails, scoringAvailable: body.data.scoring_available };
}

/** The parser. It answers `{ ok: true }` and nothing else, so reaching it at all is the check. */
export async function probeDocExtract(baseUrl: string, timeoutMs: number): Promise<Record<string, never>> {
  await readJson(`${trimmed(baseUrl)}/healthz`, timeoutMs, "doc-extract /healthz");
  return {};
}

const ProxyHealth = z.object({ models: z.array(z.string()).optional() });

/**
 * The model gateway, through its own health endpoint and never through a
 * completion: `/healthz` reads the alias table and starts no session, so this
 * says the proxy is serving without saying anything about a cold model.
 *
 * It is a reading, not a gate. A proxy that is down degrades the report; it
 * has never been a reason to call the api unhealthy, because the api serves
 * every screen without it.
 */
export async function probeLlmProxy(baseUrl: string, timeoutMs: number): Promise<{ models?: number }> {
  const body = ProxyHealth.safeParse(await readJson(`${trimmed(baseUrl)}/healthz`, timeoutMs, "llm-proxy /healthz"));
  return body.success && body.data.models ? { models: body.data.models.length } : {};
}
