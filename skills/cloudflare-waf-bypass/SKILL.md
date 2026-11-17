---
name: cloudflare-waf-bypass
description: Let verified AI answer-engine crawlers (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot) through Cloudflare's WAF and bot protection with a skip rule, without opening the site to scrapers that fake their user-agent.
tools:
  - bash
---

# Cloudflare WAF skip rule for AI crawlers

Cloudflare often serves AI crawlers a 403 or a managed challenge even when
robots.txt allows them. The usual causes: Bot Fight Mode or Super Bot Fight
Mode, the "Block AI bots" setting, a custom rule that challenges unknown
user-agents, or a rate limit.

## 1. Confirm the block

```bash
npx -y @citewin/aeo-scan https://example.com --json
```

A `bot:GPTBot` (or other bot) check that fails with "403 for GPTBot, 200 for
a browser" or "Cloudflare challenge page" confirms it. Then open
**Security > Events** in the dashboard, filter by user-agent, and note which
service blocked it (custom rule, managed rule, bot fight mode).

Note that the scanner's requests come from your machine, not from the bots'
real IP ranges. The real crawlers are usually "verified bots" to Cloudflare
and may be treated differently. Security Events for the real user-agents is
the ground truth.

## 2. Turn off blanket AI blocking (if on)

**Security > Bots** (or **AI Crawl Control**, depending on plan and
dashboard version): turn off "Block AI bots" / "Block AI Scrapers and
Crawlers", or set the crawlers you want to Allow. This setting blocks them
regardless of custom rules.

## 3. Add the skip rule

**Security > WAF > Custom rules > Create rule**

- **Name:** Allow verified AI answer-engine crawlers
- **Expression** (Edit expression):

  ```
  (cf.client.bot and (http.user_agent contains "GPTBot" or http.user_agent contains "OAI-SearchBot" or http.user_agent contains "ClaudeBot" or http.user_agent contains "PerplexityBot"))
  ```

- **Action:** Skip. Tick "All remaining custom rules", plus the products
  that were blocking (Rate limiting rules, Managed rules, Super Bot Fight
  Mode) on your plan.
- **Placement:** first.

`cf.client.bot` is true only for requests Cloudflare has verified as coming
from the bot's published IP ranges. A scraper that copies the `GPTBot`
user-agent from a residential IP does not match and is still challenged.
Do not drop that condition and match on user-agent alone.

Prefer Terraform? Use a `cloudflare_ruleset` in the `http_request_firewall_custom`
phase with `action = "skip"`, the expression above, and
`action_parameters { ruleset = "current" phases = [...] products = [...] }`.

## 4. robots.txt

Make sure robots.txt does not disallow them either:

```
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /
```

To keep a bot out of training but allow it in search, disallow `GPTBot`
and allow `OAI-SearchBot`.

## 5. Verify

Rerun `npx -y @citewin/aeo-scan <url>` and watch Security Events for the
real crawlers over the next days. A crawler that is not on Cloudflare's
verified list for your zone will not match `cf.client.bot`; check its
status under **Security > Bots > Verified bots** before widening the rule.

Run `npx -y @citewin/aeo-scan <url> --fix` to print this rule and the
robots.txt snippet in the terminal.
