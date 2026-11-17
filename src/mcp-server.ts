import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fixesOf, scan, VERSION } from "./scan.js";

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({ name: "aeo-scan", version: VERSION });

  server.registerTool(
    "aeo_scan",
    {
      title: "AEO scan",
      description:
        "Run the three-hop AEO audit on a URL: AI crawler access and WAF blocks, llms.txt, JSON-LD and front-loaded facts, and (when API keys are set) live ChatGPT and Perplexity probes. Returns a 0-100 score, every check, and copy-paste fixes.",
      inputSchema: {
        url: z.string().describe("Page to audit, for example https://example.com or localhost:3000"),
      },
    },
    async ({ url }) => {
      try {
        const result = await scan(url);
        const fixes = fixesOf(result).map((c) => ({ check: c.label, status: c.status, fix: c.fix }));
        return { content: [{ type: "text", text: JSON.stringify({ ...result, fixes }, null, 2) }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
        };
      }
    },
  );

  await server.connect(new StdioServerTransport());
}
