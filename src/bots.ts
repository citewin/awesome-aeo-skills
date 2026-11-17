export interface Bot {
  /** robots.txt product token. */
  token: string;
  engine: string;
  userAgent: string;
}

// User-agent strings as published by OpenAI, Anthropic and Perplexity.
export const AI_BOTS: Bot[] = [
  {
    token: "GPTBot",
    engine: "ChatGPT (training)",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  },
  {
    token: "OAI-SearchBot",
    engine: "ChatGPT search",
    userAgent:
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
  },
  {
    token: "ClaudeBot",
    engine: "Claude",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  },
  {
    token: "PerplexityBot",
    engine: "Perplexity",
    userAgent:
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  },
];

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const SCANNER_UA = "aeo-scan/1.0 (+https://github.com/citewin/awesome-aeo-skills)";
