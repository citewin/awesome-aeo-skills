---
name: aeo-audit
description: Run an instant 3-hop AEO audit on any domain to check AI search readiness across ChatGPT, Perplexity, and Claude.
tools:
  - bash
---

# AEO audit

Checks whether AI answer engines can crawl, read and cite a page, using the
three-hop model:

1. **Crawler and firewall gate.** Fetches the page as GPTBot, OAI-SearchBot,
   ClaudeBot and PerplexityBot, and once as a normal browser. A 403 or
   Cloudflare challenge that only the bots get is a WAF block. Also checks
   robots.txt and whether the text is in the server HTML (AI crawlers do not
   run JavaScript).
2. **On-page retrieval.** `/llms.txt`, Schema.org JSON-LD, whether pricing,
   target customer and alternatives appear in the first 300 words, and a
   `Link` header pointing to `/llms.txt`.
3. **Off-page consensus.** Only when `OPENAI_API_KEY` or `PERPLEXITY_API_KEY`
   is set: asks each engine about the product 3 times and counts how often it
   cites the site and which third-party domains it cites.

## When to use

- The user asks whether their site is visible to ChatGPT, Claude or Perplexity.
- Before shipping changes to a marketing site, docs site, robots.txt, WAF or
  CDN config.
- After generating `llms.txt` or JSON-LD, to confirm it is served.

## Steps

1. Pick the URL. For a local dev server, use it directly
   (`localhost:3000`); for production, use the public homepage or the page
   the user cares about.
2. Run the scan as JSON so you can read every check:

   ```bash
   npx -y @citewin/aeo-scan <url> --json
   ```

   Exit codes: `0` ran, `1` score below `--min-score`, `2` bad URL or
   unreachable, `3` unexpected error.
3. Read `hops[].checks[]`. Each has `status` (`pass`, `warn`, `fail`,
   `skip`), `detail`, and for failures a copy-paste `fix`.
4. Report to the user: the score and tier, then each `fail` and `warn` with
   its fix. Lead with Hop 1 failures, since nothing else matters if crawlers
   are blocked.
5. If a fix is a code change in this repo (llms.txt, JSON-LD, SSR, copy),
   offer to make it. Use the `llms-txt-generator`, `schema-generator` or
   `cloudflare-waf-bypass` skills for those. Rerun the scan afterwards to
   confirm.

## Notes

- `skip` on Hop 3 means no API keys were set. Say so; the score then covers
  Hops 1 and 2 only. Do not invent engine results.
- Live probes cost a few cents per run on the user's API accounts. Ask before
  setting keys the user did not provide.
- For CI, `npx @citewin/aeo-scan <url> --min-score 70` fails the job below 70.
- The full visual report is at `https://citewin.com/audit/<domain>`.
