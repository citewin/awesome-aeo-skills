# awesome-aeo-skills

[![npm](https://img.shields.io/npm/v/@citewin/aeo-scan?label=npm%20%40citewin%2Faeo-scan)](https://www.npmjs.com/package/@citewin/aeo-scan)
[![license MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/citewin/awesome-aeo-skills/pulls)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](tsconfig.json)

The open-source Answer Engine Optimization (AEO) diagnostic engine for B2B SaaS.

`aeo-scan` checks whether ChatGPT, Claude and Perplexity can crawl your site,
read it, and cite it. The `skills/` folder gives Claude Code, Cursor and other
coding agents the same checks, plus skills that fix what they find.

## Run it

```bash
# Run the CLI directly
npx @citewin/aeo-scan https://yourdomain.com

# Or install the skills into Claude Code / Cursor
npx skills add citewin/awesome-aeo-skills
```

Requires Node.js 18.17 or later. Works on local dev servers too:
`npx @citewin/aeo-scan localhost:3000`.

## What it checks

```text
🔍 aeo-scan v1.0.0 — auditing https://supabase.com/

  [HOP 1] Crawler & Firewall Ingestion Gate
  ├─ ✓ robots.txt: Valid (0 AI bot disallows)
  ├─ ✓ GPTBot: 200 OK
  ├─ ✓ OAI-SearchBot: 200 OK
  ├─ ✓ ClaudeBot: 200 OK
  ├─ ✓ PerplexityBot: 200 OK
  └─ ✓ Server-rendered HTML: 1094 words in raw HTML (1318 KB), no JavaScript needed

  [HOP 2] On-Page Retrieval Synthesis
  ├─ ✓ /llms.txt: Present (3.5 KB · 45 structured links)
  ├─ ✓ Schema.org: Organization, SoftwareApplication JSON-LD detected
  ├─ ✗ Front-loaded facts: No pricing, ICP or alternatives in the first 300 words
  └─ ⚠ Discovery: No Link header or <link> tag pointing to /llms.txt

  [HOP 3] Off-Page Consensus Anchors
  └─ – Live probes: Skipped. Set OPENAI_API_KEY or PERPLEXITY_API_KEY to ask the engines 3x each

  ┌────────────────────────────────────────────────────┐
  │  AEO READINESS SCORE: 84 / 100 (Tier: A · Strong)  │
  └────────────────────────────────────────────────────┘
  Score covers Hops 1 and 2. Hop 3 needs API keys for live probes.

  View full interactive radar, displacement alerts & fixes:
  👉 https://citewin.com/audit/supabase.com
```

Real output from a scan on 17 November 2026.

### Hop 1: crawler and firewall gate

- Fetches the page as **GPTBot**, **OAI-SearchBot**, **ClaudeBot** and
  **PerplexityBot**, and once as a normal browser. A 403, 429 or Cloudflare
  managed challenge that only the bots get is reported as a WAF block, even
  when robots.txt allows them.
- Parses robots.txt per RFC 9309 (named groups, longest match, `*` and `$`).
- Counts the words in the raw server HTML. AI crawlers do not run
  JavaScript, so an empty `<div id="__next">` shell is a blank page to them.

### Hop 2: on-page retrieval

- `/llms.txt` exists, is Markdown rather than an SPA fallback page, and has a
  title and links.
- Schema.org `SoftwareApplication`, `Organization` or `Product` JSON-LD in
  the server HTML.
- Pricing, target customer and alternatives appear in the first 300 words of
  visible text, where answer engines pull most of their quotes from.
- A `Link: </llms.txt>; rel="describedby"` header or `<link>` tag.

### Hop 3: off-page consensus

Runs only when you set API keys, because it calls the engines for real:

| Variable | Engine |
| --- | --- |
| `OPENAI_API_KEY` | ChatGPT (Responses API with web search) |
| `PERPLEXITY_API_KEY` | Perplexity (Sonar) |

It asks each engine about the product 3 times and reports how often the
answer names the brand and cites your domain, and how many third-party
domains it cites. Override models with `AEO_SCAN_OPENAI_MODEL` and
`AEO_SCAN_PERPLEXITY_MODEL`. Without keys, Hop 3 is skipped and the score
covers Hops 1 and 2.

## Flags

| Flag | What it does |
| --- | --- |
| `--json` | Prints the full result as JSON for agents and CI |
| `--fix` | Prints copy-paste fixes: the Cloudflare WAF skip rule, a robots.txt block, an llms.txt template |
| `--mcp` | Starts a stdio MCP server with an `aeo_scan` tool |
| `--min-score <n>` | Exits with code 1 when the score is below `n` |
| `--timeout <ms>` | Per-request timeout (default 15000) |

Exit codes: `0` scan ran, `1` below `--min-score`, `2` invalid or unreachable
URL, `3` unexpected error.

### CI

```yaml
- run: npx @citewin/aeo-scan https://staging.example.com --min-score 70
```

### MCP (Cursor, Claude Desktop, Claude Code)

```json
{
  "mcpServers": {
    "aeo-scan": { "command": "npx", "args": ["-y", "@citewin/aeo-scan", "--mcp"] }
  }
}
```

In Claude Code: `claude mcp add aeo-scan -- npx -y @citewin/aeo-scan --mcp`.

## Skills

Install all of them with `npx skills add citewin/awesome-aeo-skills`.

| Skill | What it does |
| --- | --- |
| [`aeo-audit`](skills/aeo-audit/SKILL.md) | Runs the three-hop audit from the agent chat and walks through the fixes |
| [`llms-txt-generator`](skills/llms-txt-generator/SKILL.md) | Reads the project's routes and writes `/llms.txt` from the real copy |
| [`schema-generator`](skills/schema-generator/SKILL.md) | Writes `SoftwareApplication`, `Organization` and `FAQPage` JSON-LD and adds it to the page head |
| [`cloudflare-waf-bypass`](skills/cloudflare-waf-bypass/SKILL.md) | A Cloudflare skip rule that lets verified AI crawlers through and keeps user-agent spoofers out |

## Develop

```bash
npm install
npm test           # vitest
npm run build      # tsc to dist/
node dist/cli.js https://example.com
```

The tests start local HTTP servers that imitate a well-built site, a site
whose firewall blocks AI bots, and an empty client-side shell. They make no
network calls.

## Backed by

Built and maintained by [citewin](https://citewin.com), the AEO and citation
intelligence platform. For the full radar, displacement alerts and tracked
fixes, open `https://citewin.com/audit/<your-domain>`.

## License

[MIT](LICENSE)
