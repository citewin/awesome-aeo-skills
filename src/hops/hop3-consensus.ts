import { errorMessage } from "../http.js";
import type { Check, HopResult } from "../types.js";

export const RUNS = 3;

/** One answer from an engine: the text plus every URL it cited. */
export interface ProbeAnswer {
  text: string;
  citations: string[];
}

export type Probe = (prompt: string) => Promise<ProbeAnswer>;

export interface Engine {
  id: string;
  label: string;
  keyEnv: string;
  make(key: string, env: Record<string, string | undefined>): Probe;
}

async function postJson(url: string, key: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
  return JSON.parse(text) as unknown;
}

interface OpenAIResponse {
  output?: {
    type: string;
    content?: { type: string; text?: string; annotations?: { type: string; url?: string }[] }[];
  }[];
}

interface PerplexityResponse {
  choices?: { message?: { content?: string } }[];
  citations?: string[];
  search_results?: { url?: string }[];
}

export const ENGINES: Engine[] = [
  {
    id: "chatgpt",
    label: "ChatGPT Readiness",
    keyEnv: "OPENAI_API_KEY",
    make: (key, env) => async (prompt) => {
      const data = (await postJson("https://api.openai.com/v1/responses", key, {
        model: env.AEO_SCAN_OPENAI_MODEL || "gpt-4.1-mini",
        tools: [{ type: "web_search" }],
        input: prompt,
      })) as OpenAIResponse;
      const parts = (data.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
      return {
        text: parts.map((p) => p.text ?? "").join("\n"),
        citations: parts.flatMap((p) => (p.annotations ?? []).map((a) => a.url ?? "")).filter(Boolean),
      };
    },
  },
  {
    id: "perplexity",
    label: "Perplexity Readiness",
    keyEnv: "PERPLEXITY_API_KEY",
    make: (key, env) => async (prompt) => {
      const data = (await postJson("https://api.perplexity.ai/chat/completions", key, {
        model: env.AEO_SCAN_PERPLEXITY_MODEL || "sonar",
        messages: [{ role: "user", content: prompt }],
      })) as PerplexityResponse;
      const urls = [...(data.citations ?? []), ...(data.search_results ?? []).map((r) => r.url ?? "")];
      return { text: data.choices?.[0]?.message?.content ?? "", citations: [...new Set(urls.filter(Boolean))] };
    },
  },
];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isOwnHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function probePrompt(brand: string, domain: string): string {
  return `What is ${brand} (${domain})? In a few sentences: what it does, who it is for, what it costs, and its main alternatives. Cite your sources.`;
}

export interface EngineTally {
  runs: number;
  ownCited: number;
  brandNamed: number;
  thirdParty: Set<string>;
  errors: string[];
}

export function tally(answers: (ProbeAnswer | Error)[], brand: string, domain: string): EngineTally {
  const t: EngineTally = { runs: 0, ownCited: 0, brandNamed: 0, thirdParty: new Set(), errors: [] };
  const brandRe = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  for (const a of answers) {
    if (a instanceof Error) {
      t.errors.push(a.message);
      continue;
    }
    t.runs++;
    const hosts = a.citations.map(hostOf).filter(Boolean);
    if (hosts.some((h) => isOwnHost(h, domain))) t.ownCited++;
    const named = brandRe.test(a.text);
    if (named) t.brandNamed++;
    // Third-party pages count only when the answer is actually about the brand.
    if (named) for (const h of hosts) if (!isOwnHost(h, domain)) t.thirdParty.add(h);
  }
  return t;
}

function engineCheck(engine: Engine, t: EngineTally): Check {
  const base = { id: `engine:${engine.id}`, label: engine.label, weight: 10 };
  if (t.runs === 0) {
    return { ...base, status: "skip", detail: `API error: ${t.errors[0] ?? "no answers"}` };
  }
  const pct = Math.round(((t.ownCited + t.brandNamed) / (2 * t.runs)) * 100);
  const detail = `${pct}% (site cited in ${t.ownCited}/${t.runs} runs, brand named in ${t.brandNamed}/${t.runs})`;
  const status = t.ownCited === t.runs ? "pass" : t.ownCited > 0 || t.brandNamed > 0 ? "warn" : "fail";
  return {
    ...base,
    status,
    detail,
    fix:
      status === "pass"
        ? undefined
        : "Engines answer from pages they can retrieve. Fix Hops 1 and 2 first, then get the product into third-party comparisons and reviews.",
  };
}

export async function runHop3(
  brand: string,
  domain: string,
  env: Record<string, string | undefined>,
  engines: Engine[] = ENGINES,
): Promise<{ hop: HopResult; live: boolean }> {
  const active = engines.filter((e) => env[e.keyEnv]);
  const title = "Off-Page Consensus Anchors";
  if (active.length === 0) {
    return {
      live: false,
      hop: {
        id: "hop3",
        title,
        checks: [
          {
            id: "live-probes",
            label: "Live probes",
            status: "skip",
            weight: 0,
            detail: `Skipped. Set ${engines.map((e) => e.keyEnv).join(" or ")} to ask the engines ${RUNS}x each`,
          },
        ],
      },
    };
  }

  const prompt = probePrompt(brand, domain);
  const tallies = await Promise.all(
    active.map(async (engine) => {
      const probe = engine.make(env[engine.keyEnv]!, env);
      const answers = await Promise.all(
        Array.from({ length: RUNS }, () => probe(prompt).catch((err: unknown) => new Error(errorMessage(err)))),
      );
      return { engine, t: tally(answers, brand, domain) };
    }),
  );

  const checks: Check[] = tallies.map(({ engine, t }) => engineCheck(engine, t));
  const thirdParty = new Set(tallies.flatMap(({ t }) => [...t.thirdParty]));
  const answered = tallies.some(({ t }) => t.runs > 0);
  const sample = [...thirdParty].slice(0, 4).join(", ");
  checks.push({
    id: "third-party",
    label: "Third-Party Citations",
    weight: 10,
    status: !answered ? "skip" : thirdParty.size >= 3 ? "pass" : thirdParty.size > 0 ? "warn" : "fail",
    detail: !answered
      ? "No answers to count"
      : `${thirdParty.size} third-party domain${thirdParty.size === 1 ? "" : "s"} cited about ${brand}${sample ? ` (${sample})` : ""}`,
    fix:
      thirdParty.size >= 3
        ? undefined
        : "Get listed in comparison and review pages the engines already cite: G2, Reddit threads, DEV.to and Substack roundups.",
  });
  return { live: answered, hop: { id: "hop3", title, checks } };
}
