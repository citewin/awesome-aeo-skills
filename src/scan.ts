import { createRequire } from "node:module";
import { metaContent, pageTitle } from "./html.js";
import type { FetchResult } from "./http.js";
import { fetchHop1, runHop1 } from "./hops/hop1-crawler.js";
import { fetchLlmsTxt, runHop2 } from "./hops/hop2-retrieval.js";
import { runHop3 } from "./hops/hop3-consensus.js";
import type { Check, HopResult, ScanOptions, ScanResult } from "./types.js";

const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
export const VERSION = pkg.version;

export class ScanError extends Error {}

export function normalizeUrl(input: string): URL {
  const raw = input.trim();
  // Local dev servers rarely have TLS, so a bare local host defaults to http.
  const local = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(raw);
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `${local ? "http" : "https"}://${raw}`);
  } catch {
    throw new ScanError(`Not a valid URL: ${input}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ScanError(`Only http and https URLs can be scanned (got ${url.protocol})`);
  }
  url.hash = "";
  return url;
}

export function domainOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

/** Brand name for the Hop 3 prompts: og:site_name, else the first title segment, else the domain label. */
export function brandOf(html: string, domain: string): string {
  const site = metaContent(html, "og:site_name");
  if (site && site.length <= 40) return site;
  const t = pageTitle(html)?.split(/\s[|\-–—:·]\s/)[0]?.trim();
  if (t && t.length <= 30 && t.split(/\s+/).length <= 3) return t;
  const label = domain.split(".")[0] ?? domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const STATUS_SCORE = { pass: 1, warn: 0.5, fail: 0 } as const;

export function score(hops: HopResult[]): number {
  let earned = 0;
  let total = 0;
  for (const c of hops.flatMap((h) => h.checks)) {
    if (c.status === "skip" || c.weight === 0) continue;
    earned += STATUS_SCORE[c.status] * c.weight;
    total += c.weight;
  }
  return total === 0 ? 0 : Math.round((earned / total) * 100);
}

export function tierOf(n: number): { tier: string; label: string } {
  if (n >= 90) return { tier: "S", label: "Citation Ready" };
  if (n >= 75) return { tier: "A", label: "Strong" };
  if (n >= 60) return { tier: "B", label: "Needs Work" };
  if (n >= 40) return { tier: "C", label: "At Risk" };
  return { tier: "D", label: "Invisible to AI" };
}

function ok(r: FetchResult): boolean {
  return r.status >= 200 && r.status < 300;
}

export async function scan(input: string, opts: ScanOptions = {}): Promise<ScanResult> {
  const url = normalizeUrl(input);
  const domain = domainOf(url);
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const env = opts.env ?? process.env;

  const [h1ctx, llms] = await Promise.all([fetchHop1(url, timeoutMs), fetchLlmsTxt(url, timeoutMs)]);
  const responses = [h1ctx.page, ...Object.values(h1ctx.bots)];
  if (responses.every((r) => r.status === 0)) {
    throw new ScanError(`Could not reach ${url.href}: ${h1ctx.page.error ?? "no response"}`);
  }

  // Read the page as a browser sees it; if the browser was blocked, use any bot that got through.
  const page = ok(h1ctx.page) ? h1ctx.page : (responses.find(ok) ?? h1ctx.page);
  const hop1 = runHop1({ ...h1ctx, page });
  const hop2 = runHop2({ page, robots: h1ctx.robots, llms });
  const hop3 = await runHop3(brandOf(page.body, domain), domain, env);

  const hops = [hop1, hop2, hop3.hop];
  const n = score(hops);
  const { tier, label } = tierOf(n);
  return {
    tool: "aeo-scan",
    version: VERSION,
    scannedAt: new Date().toISOString(),
    url: url.href,
    domain,
    score: n,
    tier,
    tierLabel: label,
    liveProbes: hop3.live,
    hops,
    auditUrl: `https://citewin.com/audit/${encodeURIComponent(domain)}`,
  };
}

export function fixesOf(result: ScanResult): Check[] {
  const seen = new Set<string>();
  return result.hops
    .flatMap((h) => h.checks)
    .filter((c) => (c.status === "fail" || c.status === "warn") && c.fix)
    .filter((c) => (seen.has(c.fix!) ? false : (seen.add(c.fix!), true)));
}
