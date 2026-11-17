import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runHop3, type Engine } from "../src/hops/hop3-consensus.js";
import { fixesOf, scan } from "../src/scan.js";
import type { ScanResult } from "../src/types.js";

const GOOD_PAGE = `<!doctype html><html><head><title>Acme | Billing for SaaS</title>
<meta property="og:site_name" content="Acme">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Acme"}</script>
</head><body><main>
<h1>Acme is usage-based billing built for SaaS teams</h1>
<p>Plans start at $49 per month. Acme is the open alternative to Stripe Billing and Chargebee.</p>
${"<p>Acme meters events, rates them against your price book and sends invoices every cycle without code.</p>".repeat(12)}
</main></body></html>`;

/** Serves a site that blocks AI bots with a 403 everywhere except robots.txt, like a misconfigured WAF. */
function site(opts: { blockBots: boolean; llms: boolean; shell?: boolean }): Server {
  return createServer((req, res) => {
    const ua = req.headers["user-agent"] ?? "";
    const bot = /GPTBot|ClaudeBot|PerplexityBot|OAI-SearchBot/.test(ua);
    if (req.url === "/robots.txt") {
      res.setHeader("content-type", "text/plain");
      return res.end("User-agent: *\nAllow: /\n");
    }
    if (req.url === "/llms.txt") {
      if (!opts.llms) {
        res.statusCode = 404;
        return res.end("not found");
      }
      res.setHeader("content-type", "text/markdown");
      return res.end("# Acme\n\n> Billing for SaaS.\n\n## Docs\n- [Pricing](https://acme.test/pricing)\n");
    }
    if (bot && opts.blockBots) {
      res.statusCode = 403;
      return res.end("Forbidden");
    }
    res.setHeader("content-type", "text/html");
    res.setHeader("link", '</llms.txt>; rel="describedby"');
    res.end(opts.shell ? '<html><body><div id="__next"></div><script src="/app.js"></script></body></html>' : GOOD_PAGE);
  });
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}

function check(result: ScanResult, id: string) {
  return result.hops.flatMap((h) => h.checks).find((c) => c.id === id);
}

describe("scan against a local site", () => {
  const servers: Server[] = [];
  let good = "";
  let blocked = "";
  let shell = "";

  beforeAll(async () => {
    const make = async (o: Parameters<typeof site>[0]) => {
      const s = site(o);
      servers.push(s);
      return listen(s);
    };
    good = await make({ blockBots: false, llms: true });
    blocked = await make({ blockBots: true, llms: false });
    shell = await make({ blockBots: false, llms: false, shell: true });
  });

  afterAll(() => servers.forEach((s) => s.close()));

  it("passes every Hop 1 and Hop 2 check on a well-built page", async () => {
    const r = await scan(good, { env: {} });
    const failing = r.hops.slice(0, 2).flatMap((h) => h.checks).filter((c) => c.status !== "pass");
    expect(failing).toEqual([]);
    expect(r.score).toBe(100);
    expect(r.liveProbes).toBe(false);
    expect(r.auditUrl).toBe("https://citewin.com/audit/127.0.0.1");
  });

  it("flags a 403 that only AI bots get, even though robots.txt allows them", async () => {
    const r = await scan(blocked, { env: {} });
    expect(check(r, "robots")?.status).toBe("pass");
    for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot"]) {
      const c = check(r, `bot:${bot}`);
      expect(c?.status).toBe("fail");
      expect(c?.detail).toMatch(/403 for .*200 for a browser/);
    }
    expect(check(r, "llms-txt")?.status).toBe("fail");
    expect(r.score).toBeLessThan(60);
    expect(fixesOf(r).length).toBeGreaterThan(0);
  });

  it("fails the SSR check on an empty client-side shell", async () => {
    const r = await scan(shell, { env: {} });
    expect(check(r, "ssr")).toMatchObject({ status: "fail" });
    expect(check(r, "ssr")?.detail).toMatch(/empty client-side app shell/);
  });
});

describe("hop 3", () => {
  const fake = (answers: { text: string; citations: string[] }[]): Engine => {
    let i = 0;
    return {
      id: "fake",
      label: "Fake Readiness",
      keyEnv: "FAKE_KEY",
      make: () => async () => answers[i++ % answers.length]!,
    };
  };

  it("skips without keys and adds no weight", async () => {
    const { hop, live } = await runHop3("Acme", "acme.io", {}, [fake([])]);
    expect(live).toBe(false);
    expect(hop.checks).toEqual([expect.objectContaining({ status: "skip", weight: 0 })]);
  });

  it("measures consistency across the three runs", async () => {
    const engine = fake([
      { text: "Acme is billing software.", citations: ["https://acme.io/", "https://www.g2.com/acme"] },
      { text: "Acme bills usage.", citations: ["https://reddit.com/r/saas/1", "https://dev.to/x"] },
      { text: "I am not sure.", citations: ["https://unrelated.example/"] },
    ]);
    const { hop, live } = await runHop3("Acme", "acme.io", { FAKE_KEY: "k" }, [engine]);
    expect(live).toBe(true);
    const [engineCheck, thirdParty] = hop.checks;
    expect(engineCheck).toMatchObject({ status: "warn", detail: "50% (site cited in 1/3 runs, brand named in 2/3)" });
    // unrelated.example came from an answer that never named Acme, so it does not count.
    expect(thirdParty).toMatchObject({ status: "pass" });
    expect(thirdParty?.detail).toMatch(/^3 third-party domains/);
  });

  it("skips an engine whose API fails every run", async () => {
    const broken: Engine = { id: "x", label: "X", keyEnv: "K", make: () => () => Promise.reject(new Error("HTTP 401")) };
    const { hop, live } = await runHop3("Acme", "acme.io", { K: "k" }, [broken]);
    expect(live).toBe(false);
    expect(hop.checks[0]).toMatchObject({ status: "skip", detail: "API error: HTTP 401" });
  });
});
