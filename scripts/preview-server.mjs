// Serves data/gallery-preview.html for visual checks. Not part of the MCP itself.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(readFileSync(join(root, "data", "gallery-preview.html")));
}).listen(4173, "127.0.0.1", () => console.log("preview on http://127.0.0.1:4173/"));
