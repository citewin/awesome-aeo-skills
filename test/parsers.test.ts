import { describe, expect, it } from "vitest";
import { jsonLd, visibleText, wordCount } from "../src/html.js";
import { isAllowed, parseRobots } from "../src/robots.js";
import { brandOf, normalizeUrl, score, tierOf } from "../src/scan.js";
import type { HopResult } from "../src/types.js";

describe("robots.txt", () => {
  it("lets a named group override the * group", () => {
    const g = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /\n");
    expect(isAllowed(g, "GPTBot")).toBe(true);
    expect(isAllowed(g, "ClaudeBot")).toBe(false);
  });

  it("treats an empty Disallow as allow-all", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:\n"), "PerplexityBot")).toBe(true);
  });

  it("uses the longest match, Allow winning ties", () => {
    const g = parseRobots("User-agent: *\nDisallow: /docs\nAllow: /docs/public\n");
    expect(isAllowed(g, "GPTBot", "/docs/private")).toBe(false);
    expect(isAllowed(g, "GPTBot", "/docs/public/a")).toBe(true);
  });

  it("supports * and $ wildcards", () => {
    const g = parseRobots("User-agent: ClaudeBot\nDisallow: /*.pdf$\n");
    expect(isAllowed(g, "ClaudeBot", "/a/b.pdf")).toBe(false);
    expect(isAllowed(g, "ClaudeBot", "/a/b.pdf?x=1")).toBe(true);
  });

  it("groups stacked user-agent lines", () => {
    const g = parseRobots("User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n");
    expect(isAllowed(g, "ClaudeBot")).toBe(false);
    expect(isAllowed(g, "OAI-SearchBot")).toBe(true);
  });
});

describe("html", () => {
  it("drops scripts and styles from visible text", () => {
    const text = visibleText("<body><script>var a=1</script><style>p{}</style><p>Hello &amp; welcome</p></body>");
    expect(text).toBe("Hello & welcome");
  });

  it("counts an empty Next.js shell as zero words", () => {
    expect(wordCount(visibleText('<body><div id="__next"></div><script src="/a.js"></script></body>'))).toBe(0);
  });

  it("collects nested JSON-LD types and counts parse errors", () => {
    const html =
      '<script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["SoftwareApplication"],"offers":{"@type":"Offer"}}]}</script>' +
      '<script type="application/ld+json">{broken</script>';
    const ld = jsonLd(html);
    expect(ld.types.sort()).toEqual(["Offer", "Organization", "SoftwareApplication"]);
    expect(ld).toMatchObject({ blocks: 2, errors: 1 });
  });
});

describe("scan helpers", () => {
  it("adds https:// to a bare domain and rejects other schemes", () => {
    expect(normalizeUrl("example.com").href).toBe("https://example.com/");
    expect(normalizeUrl("localhost:3000").href).toBe("http://localhost:3000/");
    expect(normalizeUrl("127.0.0.1:8080/docs").href).toBe("http://127.0.0.1:8080/docs");
    expect(() => normalizeUrl("ftp://example.com")).toThrow(/http and https/);
  });

  it("picks the brand from og:site_name, then the title", () => {
    expect(brandOf('<meta property="og:site_name" content="Supabase">', "supabase.com")).toBe("Supabase");
    expect(brandOf("<title>Linear | Plan and build products</title>", "linear.app")).toBe("Linear");
    expect(brandOf("", "acme.io")).toBe("Acme");
  });

  it("scores warn as half and leaves skipped checks out", () => {
    const hops: HopResult[] = [
      {
        id: "hop1",
        title: "t",
        checks: [
          { id: "a", label: "a", status: "pass", detail: "", weight: 10 },
          { id: "b", label: "b", status: "warn", detail: "", weight: 10 },
          { id: "c", label: "c", status: "skip", detail: "", weight: 50 },
        ],
      },
    ];
    expect(score(hops)).toBe(75);
    expect(tierOf(92)).toEqual({ tier: "S", label: "Citation Ready" });
    expect(tierOf(10).tier).toBe("D");
  });
});
