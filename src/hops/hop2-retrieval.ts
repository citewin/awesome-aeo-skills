import { LINK_HEADER, LLMS_TXT_TEMPLATE } from "../fixes.js";
import { jsonLd, visibleText, words } from "../html.js";
import { get, isHtml, type FetchResult } from "../http.js";
import type { Check, HopResult } from "../types.js";
import { SCANNER_UA } from "../bots.js";

/** How many leading words of visible text count as "the top of the page". */
export const TOP_WORDS = 300;

export interface Hop2Context {
  page: FetchResult;
  robots: FetchResult;
  llms: FetchResult;
}

export async function fetchLlmsTxt(url: URL, timeoutMs: number): Promise<FetchResult> {
  return get(new URL("/llms.txt", url).href, SCANNER_UA, timeoutMs);
}

export function runHop2(ctx: Hop2Context): HopResult {
  return {
    id: "hop2",
    title: "On-Page Retrieval Synthesis",
    checks: [llmsCheck(ctx.llms), schemaCheck(ctx.page), positionCheck(ctx.page), discoveryCheck(ctx)],
  };
}

function llmsCheck(r: FetchResult): Check {
  const base = { id: "llms-txt", label: "/llms.txt", weight: 10 };
  if (r.status !== 200) {
    return {
      ...base,
      status: "fail",
      detail: r.error ? `Unreachable (${r.error})` : `Missing (HTTP ${r.status})`,
      fix: `Publish a Markdown file at /llms.txt (see https://llmstxt.org):\n\n${LLMS_TXT_TEMPLATE}`,
    };
  }
  // Single-page apps often answer every path with index.html and a 200.
  if (isHtml(r)) {
    return {
      ...base,
      status: "fail",
      detail: "Returns an HTML page, not a Markdown file (catch-all route?)",
      fix: `Serve /llms.txt as text/plain or text/markdown:\n\n${LLMS_TXT_TEMPLATE}`,
    };
  }
  const links = r.body.match(/\[[^\]\n]+\]\([^)\s]+\)/g)?.length ?? 0;
  const hasH1 = /^#\s+\S/m.test(r.body);
  const kb = (r.bytes / 1024).toFixed(1);
  if (!hasH1 || links === 0) {
    return {
      ...base,
      status: "warn",
      detail: `Present (${kb} KB) but ${!hasH1 ? "no # title" : "no Markdown links"}`,
      fix: `Follow the llms.txt format: a # title, a > summary, then ## sections of [name](url) links.\n\n${LLMS_TXT_TEMPLATE}`,
    };
  }
  return { ...base, status: "pass", detail: `Present (${kb} KB · ${links} structured links)` };
}

const ENTITY_TYPES = ["SoftwareApplication", "WebApplication", "MobileApplication", "Organization", "Corporation", "Product"];

function schemaCheck(page: FetchResult): Check {
  const base = { id: "schema", label: "Schema.org", weight: 15 };
  if (page.status < 200 || page.status >= 300) {
    return { ...base, status: "skip", detail: "Page did not load" };
  }
  const ld = jsonLd(page.body);
  const entities = ld.types.filter((t) => ENTITY_TYPES.includes(t));
  const fix =
    "Add SoftwareApplication and Organization JSON-LD in a <script type=\"application/ld+json\"> tag. The schema-generator skill in this repo writes it from your real pricing and copy.";
  if (entities.length) {
    const broken = ld.errors ? ` (${ld.errors} block${ld.errors > 1 ? "s" : ""} failed to parse)` : "";
    return {
      ...base,
      status: ld.errors ? "warn" : "pass",
      detail: `${entities.join(", ")} JSON-LD detected${broken}`,
    };
  }
  if (ld.blocks) {
    const found = ld.types.length ? ld.types.slice(0, 4).join(", ") : "no @type";
    return { ...base, status: "warn", detail: `JSON-LD present (${found}) but no product or organization entity`, fix };
  }
  return { ...base, status: "fail", detail: "No JSON-LD in the server HTML", fix };
}

const FACTS: { name: string; re: RegExp }[] = [
  {
    name: "pricing",
    re: /[$€£]\s?\d|\bpric(e|es|ing)\b|\bfree (plan|tier|trial|forever)\b|\bper (month|seat|user)\b|\/mo\b/i,
  },
  {
    name: "ICP",
    re: /\b(built|made|designed) for\b|\bfor (teams|developers|engineers|startups|businesses|companies|enterprises|marketers|agencies|founders|creators)\b|\bfor (b2b|saas|[a-z]+) (teams|companies|brands)\b/i,
  },
  {
    name: "alternatives",
    re: /\balternatives?\b|\bvs\.?\s|\bversus\b|\bcompared? (to|with)\b|\bunlike\b|\breplaces?\b|\binstead of\b/i,
  },
];

/** Index of the first word at which a fact pattern matches, or -1. */
function firstMatch(topWords: string[], re: RegExp): number {
  // Match against a sliding join so multi-word patterns still hit.
  for (let i = 0; i < topWords.length; i++) {
    if (re.test(topWords.slice(i, i + 4).join(" "))) return i;
  }
  return -1;
}

function positionCheck(page: FetchResult): Check {
  const base = { id: "position", label: "Front-loaded facts", weight: 15 };
  if (page.status < 200 || page.status >= 300) {
    return { ...base, status: "skip", detail: "Page did not load" };
  }
  const top = words(visibleText(page.body)).slice(0, TOP_WORDS);
  const hits = FACTS.map((f) => ({ name: f.name, at: firstMatch(top, f.re) }));
  const found = hits.filter((h) => h.at >= 0);
  const missing = hits.filter((h) => h.at < 0).map((h) => h.name);
  const lastAt = found.length ? Math.max(...found.map((h) => h.at)) + 1 : 0;
  const fix = `Put ${missing.join(", ")} in the first ${TOP_WORDS} words of the page: one plain sentence each, in the hero or the paragraph under it.`;
  if (found.length === FACTS.length) {
    return { ...base, status: "pass", detail: `Pricing, ICP and alternatives within the first ${lastAt} words` };
  }
  if (found.length === 0) {
    return { ...base, status: "fail", detail: `No pricing, ICP or alternatives in the first ${top.length} words`, fix };
  }
  return {
    ...base,
    status: "warn",
    detail: `${found.map((h) => h.name).join(" & ")} in the top ${TOP_WORDS} words; missing ${missing.join(", ")}`,
    fix,
  };
}

function discoveryCheck(ctx: Hop2Context): Check {
  const base = { id: "discovery", label: "Discovery", weight: 5 };
  const headers = [ctx.page.headers.get("link") ?? "", ctx.robots.headers.get("link") ?? ""].join(",");
  if (/llms\.txt/i.test(headers)) {
    return { ...base, status: "pass", detail: "Link header points to /llms.txt" };
  }
  if (/<link[^>]+href=["'][^"']*llms\.txt["']/i.test(ctx.page.body)) {
    return { ...base, status: "pass", detail: "<link> tag points to /llms.txt" };
  }
  return {
    ...base,
    status: "warn",
    detail: "No Link header or <link> tag pointing to /llms.txt",
    fix: `Send this response header on your pages and robots.txt:\n  ${LINK_HEADER}`,
  };
}
