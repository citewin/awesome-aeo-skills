import { AI_BOTS, BROWSER_UA } from "../bots.js";
import { CLOUDFLARE_RULE, ROBOTS_SNIPPET } from "../fixes.js";
import { visibleText, wordCount } from "../html.js";
import { get, isChallenge, isCloudflare, isHtml, type FetchResult } from "../http.js";
import { isAllowed, parseRobots } from "../robots.js";
import type { Check, HopResult } from "../types.js";

export interface Hop1Context {
  url: URL;
  robots: FetchResult;
  /** The page as fetched with a normal browser user-agent. */
  page: FetchResult;
  /** The page as fetched by each AI bot, keyed by robots token. */
  bots: Record<string, FetchResult>;
  timeoutMs: number;
}

export async function fetchHop1(url: URL, timeoutMs: number): Promise<Hop1Context> {
  const [robots, page, ...botResults] = await Promise.all([
    get(new URL("/robots.txt", url).href, BROWSER_UA, timeoutMs),
    get(url.href, BROWSER_UA, timeoutMs),
    ...AI_BOTS.map((b) => get(url.href, b.userAgent, timeoutMs)),
  ]);
  const bots: Record<string, FetchResult> = {};
  AI_BOTS.forEach((b, i) => (bots[b.token] = botResults[i]!));
  return { url, robots: robots!, page: page!, bots, timeoutMs };
}

export function runHop1(ctx: Hop1Context): HopResult {
  const checks: Check[] = [robotsCheck(ctx)];
  for (const bot of AI_BOTS) checks.push(botCheck(bot.token, ctx.bots[bot.token]!, ctx.page));
  checks.push(ssrCheck(ctx.page));
  return { id: "hop1", title: "Crawler & Firewall Ingestion Gate", checks };
}

function robotsCheck(ctx: Hop1Context): Check {
  const base = { id: "robots", label: "robots.txt", weight: 10 };
  const r = ctx.robots;
  if (r.status === 404 || r.status === 410) {
    return { ...base, status: "pass", detail: "Not found (every crawler is allowed by default)" };
  }
  if (r.status !== 200 || isHtml(r)) {
    return {
      ...base,
      status: "warn",
      detail: r.error ? `Unreachable (${r.error})` : `HTTP ${r.status}, not a plain-text robots.txt`,
      fix: ROBOTS_SNIPPET,
    };
  }
  const groups = parseRobots(r.body);
  const path = ctx.url.pathname || "/";
  const blocked = AI_BOTS.filter((b) => !isAllowed(groups, b.token, path)).map((b) => b.token);
  if (blocked.length === 0) {
    return { ...base, status: "pass", detail: "Valid (0 AI bot disallows)" };
  }
  return {
    ...base,
    status: blocked.length === AI_BOTS.length ? "fail" : "warn",
    detail: `Disallows ${blocked.join(", ")} on ${path}`,
    fix: ROBOTS_SNIPPET,
  };
}

function botCheck(token: string, r: FetchResult, browser: FetchResult): Check {
  const base = { id: `bot:${token}`, label: token, weight: 10 };
  if (r.error) {
    return { ...base, status: "fail", detail: `No response (${r.error})` };
  }
  const cf = isCloudflare(r);
  if (isChallenge(r)) {
    return {
      ...base,
      status: "fail",
      detail: `${r.status} Cloudflare challenge page (bots cannot solve it)`,
      fix: CLOUDFLARE_RULE,
    };
  }
  if (r.status >= 200 && r.status < 300) {
    const sameAsBrowser = browser.status >= 200 && browser.status < 300;
    return {
      ...base,
      status: "pass",
      detail: `${r.status} OK${cf ? " (passed Cloudflare)" : ""}${sameAsBrowser ? "" : `, browser got ${browser.status}`}`,
    };
  }
  const browserOk = browser.status >= 200 && browser.status < 300;
  if (browserOk && (r.status === 403 || r.status === 401 || r.status === 429 || r.status === 503)) {
    return {
      ...base,
      status: "fail",
      detail: `${r.status} for ${token}, 200 for a browser (${cf ? "Cloudflare" : "firewall or bot rule"} block)`,
      fix: cf ? CLOUDFLARE_RULE : undefined,
    };
  }
  return { ...base, status: "fail", detail: `HTTP ${r.status}` };
}

/**
 * AI crawlers do not run JavaScript. A page whose server HTML is an empty app shell
 * is blank to them even when it renders fine in a browser.
 */
function ssrCheck(page: FetchResult): Check {
  const base = { id: "ssr", label: "Server-rendered HTML", weight: 15 };
  if (page.error || page.status < 200 || page.status >= 300) {
    return { ...base, status: "skip", detail: "Page did not load, so the HTML could not be checked" };
  }
  const text = visibleText(page.body);
  const count = wordCount(text);
  const shell = /<div[^>]+id=["'](__next|root|app|__nuxt|svelte)["'][^>]*>\s*<\/div>/i.test(page.body);
  const kb = (page.bytes / 1024).toFixed(0);
  if (count < 50) {
    return {
      ...base,
      status: "fail",
      detail: `${count} words in ${kb} KB of raw HTML${shell ? ", empty client-side app shell" : ""}`,
      fix: "Render the page on the server (Next.js: Server Components or SSG; React SPA: prerender) so the text is in the first HTML response.",
    };
  }
  if (count < 150) {
    return { ...base, status: "warn", detail: `Only ${count} words in raw HTML (${kb} KB)` };
  }
  return { ...base, status: "pass", detail: `${count} words in raw HTML (${kb} KB), no JavaScript needed` };
}
