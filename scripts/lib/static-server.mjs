import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
};
export function createStaticServer({
  directory = path.resolve(import.meta.dirname, "../..", "dist"),
} = {}) {
  const root = fs.realpathSync(directory);
  return http.createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end("method not allowed");
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(request.url || "/", "http://localhost").pathname,
      );
    } catch {
      response.writeHead(400).end("bad path encoding");
      return;
    }
    if (pathname.includes("\0")) {
      response.writeHead(400).end("bad path");
      return;
    }
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    let target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) {
      response.writeHead(404).end("not found");
      return;
    }
    try {
      target = fs.realpathSync(target);
      if (!target.startsWith(root + path.sep) || !fs.statSync(target).isFile())
        throw new Error();
    } catch {
      response.writeHead(404).end("not found");
      return;
    }
    response.setHeader(
      "Content-Type",
      (types[path.extname(target)] || "application/octet-stream") +
        "; charset=utf-8",
    );
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Referrer-Policy", "no-referrer");
    if (request.method === "HEAD") {
      response.writeHead(200).end();
      return;
    }
    const stream = fs.createReadStream(target);
    stream.on("error", () => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
    stream.pipe(response);
  });
}
