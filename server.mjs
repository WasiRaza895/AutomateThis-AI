import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { AuditError, crawlSite } from "./lib/crawl.mjs";
import { makeAudit, sampleAudit } from "./lib/audit.mjs";

const assets = new Map([
  ["/", ["index.html", "text/html"]], ["/index.html", ["index.html", "text/html"]],
  ["/planner.html", ["planner.html", "text/html"]], ["/app.js", ["app.js", "text/javascript"]],
  ["/styles.css", ["styles.css", "text/css"]], ["/studio.css", ["studio.css", "text/css"]],
  ["/studio.js", ["studio.js", "text/javascript"]],
]);

function send(response, status, body, type) {
  response.writeHead(status, {
    "Content-Type": `${type}; charset=utf-8`, "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function json(response, status, data) {
  send(response, status, JSON.stringify(data), "application/json");
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")) {
    throw new AuditError("Send the website address as JSON.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 4 * 1024) {
      request.resume();
      throw new AuditError("Enter a shorter website address.");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AuditError("Enter a valid website address.");
  }
}

export function createApp({ crawl = crawlSite, apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL } = {}) {
  let activeAudits = 0;
  return createServer({ requestTimeout: 30000, headersTimeout: 10000 }, async (request, response) => {
    const path = request.url.split("?")[0];
    try {
      if (request.method === "GET" && assets.has(path)) {
        const [file, type] = assets.get(path);
        send(response, 200, await readFile(new URL(file, import.meta.url)), type);
        return;
      }
      if (request.method === "GET" && path === "/api/sample") {
        json(response, 200, await sampleAudit());
        return;
      }
      if (request.method === "POST" && path === "/api/audit") {
        const origin = request.headers.origin;
        if (origin && new URL(origin).host !== request.headers.host) {
          json(response, 403, { error: "Open AutomateThis AI directly to start a scan." });
          return;
        }
        if (activeAudits >= 3) {
          json(response, 429, { error: "The scanner is busy. Try again in a moment." });
          return;
        }
        activeAudits += 1;
        try {
          const fields = await readJson(request);
          const pages = await crawl(fields?.url);
          json(response, 200, await makeAudit(pages, { apiKey, ...(model ? { model } : {}) }));
        } finally {
          activeAudits -= 1;
        }
        return;
      }
      json(response, 404, { error: "Page not found." });
    } catch (error) {
      const expected = error instanceof AuditError;
      if (!expected) console.error("Audit request failed", error.name);
      if (!response.headersSent) json(response, expected ? 400 : 500, {
        error: expected ? error.message : "The scan could not finish. Try again in a moment.",
      });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8780);
  const host = process.env.HOST ?? "127.0.0.1";
  const server = createApp();
  server.listen(port, host, () => console.log(`AutomateThis AI at http://${host}:${server.address().port}`));
}
