import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { json, err } from "../util.js";

const PERMISSIVE = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Unlicense", "0BSD", "CC0-1.0"]);

interface RepoResult {
  fullName: string;
  description: string | null;
  url: string;
  stars: number;
  license: string;
  licenseNote: string;
  language: string | null;
  topics: string[];
  lastPush: string;
  archived: boolean;
}

export function registerGithubTools(server: McpServer): void {
  server.registerTool(
    "search_github",
    {
      title: "Search GitHub for supporting repos",
      description:
        "Search GitHub for libraries, starter kits, components or reference implementations that can " +
        "support the app being built (e.g. 'react drag and drop kanban', 'nextjs stripe subscription " +
        "starter'). Returns repos sorted by stars with license and maintenance signals. Prefer " +
        "permissive licenses (MIT/Apache-2.0/BSD/ISC) for code you'll incorporate; flag anything GPL " +
        "to the user before using it. Set GITHUB_TOKEN in the MCP env to raise the rate limit.",
      inputSchema: {
        query: z.string().describe("What you need, e.g. 'react calendar component'"),
        language: z.string().optional().describe("Filter by language, e.g. 'typescript'"),
        minStars: z.number().int().min(0).default(50),
        limit: z.number().int().min(1).max(20).default(8),
      },
    },
    async ({ query, language, minStars, limit }) => {
      const parts = [query];
      if (language) parts.push(`language:${language}`);
      if (minStars > 0) parts.push(`stars:>=${minStars}`);
      const q = encodeURIComponent(parts.join(" "));
      const headers: Record<string, string> = {
        "User-Agent": "AppFactoryMCP/0.1",
        Accept: "application/vnd.github+json",
      };
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

      try {
        const res = await fetch(
          `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${limit}`,
          { headers, signal: AbortSignal.timeout(20000) },
        );
        if (res.status === 403 || res.status === 429) {
          return err("GitHub rate limit hit. Wait a minute or set GITHUB_TOKEN in the MCP server env.");
        }
        if (!res.ok) return err(`GitHub search failed with HTTP ${res.status}.`);
        const data = (await res.json()) as {
          total_count: number;
          items: {
            full_name: string;
            description: string | null;
            html_url: string;
            stargazers_count: number;
            license: { spdx_id: string } | null;
            language: string | null;
            topics?: string[];
            pushed_at: string;
            archived: boolean;
          }[];
        };

        const yearAgo = Date.now() - 365 * 24 * 3600 * 1000;
        const results: RepoResult[] = data.items.map((r) => {
          const spdx = r.license?.spdx_id ?? "NONE";
          return {
            fullName: r.full_name,
            description: r.description,
            url: r.html_url,
            stars: r.stargazers_count,
            license: spdx,
            licenseNote: PERMISSIVE.has(spdx)
              ? "permissive - safe to use"
              : spdx === "NONE" || spdx === "NOASSERTION"
                ? "NO LICENSE - do not copy code from it"
                : "restrictive/copyleft - ask the user before incorporating",
            language: r.language,
            topics: (r.topics ?? []).slice(0, 8),
            lastPush: r.pushed_at,
            archived: r.archived,
          };
        });

        return json({
          totalMatches: data.total_count,
          results,
          maintenanceNote:
            "Prefer repos pushed within the last year and not archived. " +
            results
              .filter((r) => r.archived || Date.parse(r.lastPush) < yearAgo)
              .map((r) => `${r.fullName} looks unmaintained.`)
              .join(" "),
        });
      } catch (e) {
        return err(`GitHub search failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );
}
