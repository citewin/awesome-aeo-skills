import { AI_BOTS } from "./bots.js";

const tokens = AI_BOTS.map((b) => b.token);

export const ROBOTS_SNIPPET = [
  "# Let AI answer engines crawl the site",
  ...tokens.flatMap((t) => [`User-agent: ${t}`, "Allow: /", ""]),
].join("\n");

/**
 * Cloudflare custom rule expression (Security > WAF > Custom rules, action "Skip").
 * It requires Cloudflare's verified-bot signal, so a scraper that copies the
 * user-agent string is still challenged.
 */
export const CLOUDFLARE_EXPRESSION =
  `(cf.client.bot and (${tokens.map((t) => `http.user_agent contains "${t}"`).join(" or ")}))`;

export const CLOUDFLARE_RULE = [
  "Cloudflare dashboard > Security > WAF > Custom rules > Create rule",
  "  Rule name:  Allow verified AI answer-engine crawlers",
  `  Expression: ${CLOUDFLARE_EXPRESSION}`,
  "  Action:     Skip > all remaining custom rules, Super Bot Fight Mode, managed rules",
  "  Order:      first",
  "Also check Security > Bots: 'Block AI Scrapers and Crawlers' blocks these bots on its own.",
].join("\n");

export const LLMS_TXT_TEMPLATE = [
  "# Product name",
  "",
  "> One sentence: what the product does, who it is for, and what it costs.",
  "",
  "## Docs",
  "- [Getting started](https://example.com/docs/start): install and first run",
  "- [Pricing](https://example.com/pricing): plans and limits",
  "",
  "## Optional",
  "- [Changelog](https://example.com/changelog)",
].join("\n");

export const LINK_HEADER = 'Link: </llms.txt>; rel="describedby"; type="text/plain"';
