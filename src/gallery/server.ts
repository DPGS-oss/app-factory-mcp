import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import * as store from "../state/store.js";
import { galleryHtml } from "./html.js";
import { DESIGN_CATEGORIES, findChoice } from "./options.js";

interface RunningGallery {
  server: Server;
  port: number;
  url: string;
}

const running = new Map<string, RunningGallery>();

export async function launchGallery(projectId: string): Promise<{ url: string; alreadyRunning: boolean }> {
  const existing = running.get(projectId);
  if (existing) {
    openBrowser(existing.url);
    return { url: existing.url, alreadyRunning: true };
  }

  const server = createServer((req, res) => {
    const project = store.getProject(projectId);
    if (!project) {
      res.writeHead(404).end("Project not found");
      return;
    }
    if (req.method === "GET" && (req.url === "/" || req.url === "")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(galleryHtml(project));
      return;
    }
    if (req.method === "POST" && req.url === "/select") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const selections = JSON.parse(body) as Record<string, unknown>;
          for (const cat of DESIGN_CATEGORIES) {
            const id = selections[cat];
            if (!id || typeof id !== "string") throw new Error(`Missing selection for "${cat}"`);
            const choice = findChoice(cat, id);
            if (!choice) throw new Error(`Unknown ${cat} option "${id}"`);
            store.saveDesignChoice(projectId, cat, id, choice);
          }
          // Optional catalog categories
          for (const cat of ["cardStyle", "background"]) {
            const id = selections[cat];
            if (id && typeof id === "string") {
              const choice = findChoice(cat, id);
              if (!choice) throw new Error(`Unknown ${cat} option "${id}"`);
              store.saveDesignChoice(projectId, cat, id, choice);
            }
          }
          // Optional custom categories (raw objects from the color wheel / layout designer)
          for (const cat of ["colors", "layout"]) {
            const value = selections[cat];
            if (value && typeof value === "object") {
              store.saveDesignChoice(projectId, cat, "custom", value as Record<string, unknown>);
            }
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400).end(e instanceof Error ? e.message : "Bad request");
        }
      });
      return;
    }
    res.writeHead(404).end("Not found");
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") resolve(addr.port);
      else reject(new Error("Could not determine gallery port"));
    });
  });

  const url = `http://127.0.0.1:${port}/`;
  running.set(projectId, { server, port, url });
  openBrowser(url);
  return { url, alreadyRunning: false };
}

export function stopGallery(projectId: string): void {
  const g = running.get(projectId);
  if (g) {
    g.server.close();
    running.delete(projectId);
  }
}

function openBrowser(url: string): void {
  if (process.env.APP_FACTORY_NO_BROWSER) return;
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // Non-fatal: the tool response includes the URL for manual opening.
  }
}
