---
name: llms-txt-generator
description: Inspect the project's routes and content and generate a compliant /llms.txt file that tells AI answer engines what the site is and where the key pages are.
tools:
  - bash
---

# llms.txt generator

Writes `/llms.txt` in the format from [llmstxt.org](https://llmstxt.org): a
Markdown file at the site root that gives language models a short summary and
a curated list of links.

## Format

```markdown
# Product name

> One or two sentences: what it does, who it is for, what it costs.

Optional plain paragraphs with key facts (no headings here).

## Docs
- [Getting started](https://example.com/docs/start): install and first run
- [API reference](https://example.com/docs/api): endpoints and auth

## Product
- [Pricing](https://example.com/pricing): plans, limits, free tier

## Optional
- [Changelog](https://example.com/changelog)
```

Rules: exactly one `#` title; the `>` summary right under it; then `##`
sections of `- [name](absolute-url): note` lists. `## Optional` holds links
that can be skipped when context is short.

## Steps

1. **Find the public URL.** Look in `package.json` `homepage`, framework
   config (`next.config.*`, `astro.config.*`, `docusaurus.config.*`),
   `.env.example` (`SITE_URL`, `NEXT_PUBLIC_SITE_URL`), or an existing
   sitemap. Ask the user if none is found. Never use a placeholder domain.
2. **List the public routes.**
   - Next.js App Router: `app/**/page.{tsx,jsx,mdx}` (skip route groups'
     parentheses, `[param]` routes without known values, `api/`, and auth or
     dashboard pages).
   - Next.js Pages Router: `pages/**` minus `_app`, `_document`, `api/`.
   - Astro, Docusaurus, VitePress, MkDocs: `src/pages/`, `docs/`, the
     sidebar config.
   - Or read `sitemap.xml` / `public/sitemap*.xml` if one is generated.
3. **Read the pages that matter**: home, pricing, docs index, top docs,
   comparison or "alternatives" pages, about. Pull the real one-line
   description of each from its title, `metadata` export or first heading.
4. **Write the summary from real copy.** Product, audience and pricing as
   stated on the site. Do not invent prices, customer names or claims.
5. **Write the file** where the framework serves static files at the root:
   `public/llms.txt` for Next.js, Vite, Astro and most others;
   `static/llms.txt` for Docusaurus and SvelteKit.
6. **Optionally advertise it.** Add this response header (for example in
   `next.config` `headers()`, `_headers` on Cloudflare Pages or Netlify, or
   `vercel.json`):

   ```
   Link: </llms.txt>; rel="describedby"; type="text/plain"
   ```

7. **Verify.** Start the dev server and run
   `npx -y @citewin/aeo-scan localhost:3000 --json`. The `llms-txt` check
   must pass. If it reports "Returns an HTML page", a catch-all route is
   swallowing the file; exclude `/llms.txt` from it.

Keep the file under about 10 KB and 50 links. List the pages a buyer or
developer needs to answer "what is this and should I use it", not every URL.
