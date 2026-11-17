#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import pc from "picocolors";
import { startMcpServer } from "./mcp-server.js";
import { renderJson } from "./reporters/json.js";
import { renderTerminal } from "./reporters/terminal.js";
import { scan, ScanError, VERSION } from "./scan.js";

function int(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new InvalidArgumentError("Must be a whole number.");
  return n;
}

const program = new Command()
  .name("aeo-scan")
  .description("Check whether ChatGPT, Claude and Perplexity can crawl, read and cite a site.")
  .version(VERSION)
  .argument("[url]", "page to audit, e.g. https://example.com")
  .option("--json", "print machine-readable JSON")
  .option("--fix", "print copy-paste fixes (Cloudflare WAF rule, robots.txt, llms.txt)")
  .option("--mcp", "start a stdio MCP server exposing the aeo_scan tool")
  .option("--min-score <n>", "exit with code 1 when the score is below n (for CI)", int)
  .option("--timeout <ms>", "per-request timeout in milliseconds", int, 15_000)
  .addHelpText(
    "after",
    `
Hop 3 runs live probes when these are set:
  OPENAI_API_KEY        ChatGPT (Responses API with web search)
  PERPLEXITY_API_KEY    Perplexity (Sonar)

Examples:
  $ aeo-scan https://example.com
  $ aeo-scan localhost:3000 --fix
  $ aeo-scan https://example.com --json --min-score 70`,
  )
  .action(async (url: string | undefined, opts: { json?: boolean; fix?: boolean; mcp?: boolean; minScore?: number; timeout: number }) => {
    if (opts.mcp) {
      await startMcpServer();
      return;
    }
    if (!url) program.help({ error: true });

    const spinner = !opts.json && process.stderr.isTTY;
    if (spinner) process.stderr.write(pc.dim(`Scanning ${url} …\r`));
    try {
      const result = await scan(url!, { timeoutMs: opts.timeout });
      if (spinner) process.stderr.write("\x1b[2K\r");
      process.stdout.write(`${opts.json ? renderJson(result) : renderTerminal(result, { fix: opts.fix })}\n`);
      if (opts.minScore !== undefined && result.score < opts.minScore) process.exitCode = 1;
    } catch (err) {
      if (spinner) process.stderr.write("\x1b[2K\r");
      const message = err instanceof Error ? err.message : String(err);
      if (opts.json) process.stdout.write(`${JSON.stringify({ error: message })}\n`);
      else process.stderr.write(`${pc.red("aeo-scan:")} ${message}\n`);
      process.exitCode = err instanceof ScanError ? 2 : 3;
    }
  });

await program.parseAsync();
