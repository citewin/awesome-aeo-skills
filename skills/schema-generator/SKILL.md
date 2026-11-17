---
name: schema-generator
description: Generate Schema.org SoftwareApplication, Organization and FAQPage JSON-LD from the project's real product copy, pricing and FAQ, and add it to the page head.
tools:
  - bash
---

# Schema.org JSON-LD generator

Answer engines use structured data to recognise a product as an entity: its
name, category, price and maker. This skill writes that data from what the
site already says.

## Steps

1. **Collect facts from the repo**, not from memory: product name, one-line
   description, category, platforms, pricing tiers and currency (pricing
   page or pricing config), company name, logo path, social profiles, and
   FAQ entries if a FAQ section exists. If a fact is missing, leave the
   property out rather than guessing.
2. **Build one `@graph`** with the entities below. Use absolute URLs and
   stable `@id`s so they reference each other.

   ```json
   {
     "@context": "https://schema.org",
     "@graph": [
       {
         "@type": "Organization",
         "@id": "https://example.com/#org",
         "name": "Example",
         "url": "https://example.com",
         "logo": "https://example.com/logo.png",
         "sameAs": ["https://github.com/example", "https://www.linkedin.com/company/example"]
       },
       {
         "@type": "SoftwareApplication",
         "@id": "https://example.com/#app",
         "name": "Example",
         "description": "Usage-based billing for SaaS teams.",
         "applicationCategory": "BusinessApplication",
         "operatingSystem": "Web",
         "url": "https://example.com",
         "publisher": { "@id": "https://example.com/#org" },
         "offers": [
           { "@type": "Offer", "name": "Starter", "price": "49", "priceCurrency": "USD" }
         ]
       },
       {
         "@type": "FAQPage",
         "mainEntity": [
           {
             "@type": "Question",
             "name": "Does Example have a free plan?",
             "acceptedAnswer": { "@type": "Answer", "text": "Yes, up to 1,000 events a month." }
           }
         ]
       }
     ]
   }
   ```

   - Put `FAQPage` only on pages that show those questions and answers.
   - Do not add `aggregateRating` or `review` unless the page shows real
     reviews. Search engines treat invented ratings as spam.
3. **Add it to the page head, rendered on the server.** Next.js App Router:

   ```tsx
   <script
     type="application/ld+json"
     dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
   />
   ```

   in the page or layout component (not a client component, not injected
   with `useEffect`). Astro, Nuxt, plain HTML: a `<script
   type="application/ld+json">` in `<head>`.
4. **Verify.** Run `npx -y @citewin/aeo-scan <url> --json` and confirm the
   `schema` check lists `SoftwareApplication` and `Organization`. Validate
   the markup at https://validator.schema.org.
