import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { json, err } from "../util.js";

const UA = "Mozilla/5.0 (compatible; AppFactoryMCP/0.1; +https://localhost)";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function registerWebTools(server: McpServer): void {
  server.registerTool(
    "web_search",
    {
      title: "Search the web",
      description:
        "Search the internet (DuckDuckGo) for documentation, libraries, best practices or current " +
        "information needed while planning or building. Returns result titles, URLs and snippets.",
      inputSchema: {
        query: z.string(),
      },
    },
    async ({ query }) => {
      try {
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) return err(`Search failed with HTTP ${res.status}.`);
        const html = await res.text();
        const results: { title: string; url: string; snippet: string }[] = [];
        const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) && results.length < 8) {
          let url = m[1];
          const uddg = /uddg=([^&]+)/.exec(url);
          if (uddg) url = decodeURIComponent(uddg[1]);
          results.push({ title: stripHtml(m[2]), url, snippet: stripHtml(m[3]) });
        }
        if (results.length === 0) return json({ results: [], note: "No results parsed; try a different query." });
        return json({ results });
      } catch (e) {
        return err(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  server.registerTool(
    "fetch_url",
    {
      title: "Fetch a web page",
      description:
        "Fetch a URL and return its readable text content (HTML stripped). Use for reading " +
        "documentation pages, API references or content the user linked.",
      inputSchema: {
        url: z.string().describe("Full http(s) URL"),
        maxChars: z.number().int().min(500).max(50000).default(8000),
      },
    },
    async ({ url, maxChars }) => {
      if (!/^https?:\/\//i.test(url)) return err("Only http(s) URLs are supported.");
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(30000),
          redirect: "follow",
        });
        const contentType = res.headers.get("content-type") ?? "";
        const body = await res.text();
        const text = contentType.includes("html") ? stripHtml(body) : body;
        return json({
          url,
          status: res.status,
          contentType,
          truncated: text.length > maxChars,
          content: text.slice(0, maxChars),
        });
      } catch (e) {
        return err(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );
}
