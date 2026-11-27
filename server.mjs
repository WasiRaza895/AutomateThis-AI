import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { createApi } from "./lib/api.mjs";

const assets = new Map([
  ["/", ["index.html", "text/html"]], ["/index.html", ["index.html", "text/html"]],
  ["/planner.html", ["planner.html", "text/html"]], ["/app.js", ["app.js", "text/javascript"]],
  ["/styles.css", ["styles.css", "text/css"]], ["/studio.css", ["studio.css", "text/css"]],
  ["/studio.js", ["studio.js", "text/javascript"]],
]);

function send(response, status, body, type) {
  response.writeHead(status, {
    "Content-Type": `${type}; charset=utf-8`, "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

export function createApp(options) {
  const handleApi = createApi(options);
  return createServer({ requestTimeout: 30000, headersTimeout: 10000 }, async (request, response) => {
    const path = request.url.split("?")[0];
    try {
      if (request.method === "GET" && assets.has(path)) {
        const [file, type] = assets.get(path);
        send(response, 200, await readFile(new URL(file, import.meta.url)), type);
        return;
      }
      const address = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      const body = request.method === "POST" ? { body: Readable.toWeb(request), duplex: "half" } : {};
      const result = await handleApi(new Request(address, { method: request.method, headers: request.headers, ...body }));
      if (!request.readableEnded) request.resume();
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(await result.text());
    } catch (error) {
      console.error("Request failed", error.name);
      if (!response.headersSent) send(response, 500, JSON.stringify({ error: "The request could not finish. Try again in a moment." }), "application/json");
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8780);
  const host = process.env.HOST ?? "127.0.0.1";
  const server = createApp();
  server.listen(port, host, () => console.log(`AutomateThis AI at http://${host}:${server.address().port}`));
}
