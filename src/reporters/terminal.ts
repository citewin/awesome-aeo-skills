import pc from "picocolors";
import { CLOUDFLARE_RULE, ROBOTS_SNIPPET } from "../fixes.js";
import { fixesOf } from "../scan.js";
import type { CheckStatus, ScanResult } from "../types.js";

const ICON: Record<CheckStatus, string> = {
  pass: pc.green("✓"),
  warn: pc.yellow("⚠"),
  fail: pc.red("✗"),
  skip: pc.dim("–"),
};

const HOP_LABEL = { hop1: "HOP 1", hop2: "HOP 2", hop3: "HOP 3" } as const;

function scoreColor(n: number): (s: string) => string {
  return n >= 75 ? pc.green : n >= 50 ? pc.yellow : pc.red;
}

function box(text: string, color: (s: string) => string): string[] {
  const width = text.length + 4;
  return [
    `  ┌${"─".repeat(width)}┐`,
    `  │  ${color(pc.bold(text))}  │`,
    `  └${"─".repeat(width)}┘`,
  ];
}

export function renderTerminal(result: ScanResult, opts: { fix?: boolean } = {}): string {
  const out: string[] = ["", `🔍 aeo-scan v${result.version} — auditing ${pc.bold(result.url)}`, ""];

  for (const hop of result.hops) {
    out.push(`  ${pc.bold(`[${HOP_LABEL[hop.id]}] ${hop.title}`)}`);
    hop.checks.forEach((c, i) => {
      const branch = i === hop.checks.length - 1 ? "└─" : "├─";
      const detail = c.status === "skip" ? pc.dim(c.detail) : c.detail;
      out.push(`  ${pc.dim(branch)} ${ICON[c.status]} ${c.label}: ${detail}`);
    });
    out.push("");
  }

  const color = scoreColor(result.score);
  out.push(...box(`AEO READINESS SCORE: ${result.score} / 100 (Tier: ${result.tier} · ${result.tierLabel})`, color));
  if (!result.liveProbes) out.push(pc.dim("  Score covers Hops 1 and 2. Hop 3 needs API keys for live probes."));
  out.push("");

  if (opts.fix) {
    const fixes = fixesOf(result);
    out.push(pc.bold("  Fixes"), "");
    if (fixes.length === 0) out.push("  Nothing failed. Reference snippets below.", "");
    for (const c of fixes) {
      out.push(`  ${ICON[c.status]} ${pc.bold(c.label)}`, indent(c.fix!), "");
    }
    const shown = new Set(fixes.map((c) => c.fix));
    if (!shown.has(CLOUDFLARE_RULE)) out.push(pc.bold("  Cloudflare WAF skip rule"), indent(CLOUDFLARE_RULE), "");
    if (!shown.has(ROBOTS_SNIPPET)) out.push(pc.bold("  robots.txt"), indent(ROBOTS_SNIPPET), "");
  } else if (fixesOf(result).length) {
    out.push(pc.dim("  Run again with --fix for copy-paste fixes."), "");
  }

  out.push("  View full interactive radar, displacement alerts & fixes:");
  out.push(`  👉 ${pc.cyan(result.auditUrl)}`, "");
  return out.join("\n");
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
}
