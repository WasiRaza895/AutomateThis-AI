import { makeAudit, sampleAudit } from "./audit.mjs";
import { AuditError, crawlSite } from "./crawl.mjs";
import { supportsProvider } from "./models.mjs";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function json(data, status = 200) {
  return Response.json(data, { status, headers });
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "") || !request.body) {
    throw new AuditError("Send the website address as JSON.");
  }
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) throw new AuditError("Enter a shorter website address.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AuditError("Enter a valid website address.");
  }
}

function visitorModel(ai) {
  if (ai === undefined) return null;
  if (typeof ai?.apiKey !== "string" || ai.apiKey.length > 1024) {
    throw new AuditError("Enter a valid AI provider API key or leave the field blank.");
  }
  const apiKey = ai.apiKey.trim();
  if (!apiKey) return null;
  if (!supportsProvider(ai.provider)) throw new AuditError("Choose Gemini, Claude, or OpenAI for AI analysis.");
  if (!/^[!-~]+$/.test(apiKey)) throw new AuditError("The API key should contain no spaces or line breaks.");
  return { apiKey, provider: ai.provider };
}

export function createApi({ crawl = crawlSite, apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL, fetchModel } = {}) {
  let activeAudits = 0;
  return async (request) => {
    const { pathname, host, origin } = new URL(request.url);
    if (request.method === "GET" && pathname === "/api/sample") return json(await sampleAudit());
    if (request.method !== "POST" || pathname !== "/api/audit") return json({ error: "Page not found." }, 404);
    const requester = request.headers.get("origin");
    if (requester && requester !== origin && requester !== `https://${host}`) {
      return json({ error: "Open AutomateThis AI directly to start a scan." }, 403);
    }
    if (activeAudits >= 3) return json({ error: "The scanner is busy. Try again in a moment." }, 429);
    activeAudits += 1;
    try {
      const fields = await readJson(request);
      const analysis = visitorModel(fields?.ai) ?? { apiKey, model };
      const site = await crawl(fields?.url);
      return json(await makeAudit(site, { ...analysis, fetch: fetchModel }));
    } catch (error) {
      if (error instanceof AuditError) return json({ error: error.message }, 400);
      console.error("Audit request failed", error.name);
      return json({ error: "The scan could not finish. Try again in a moment." }, 500);
    } finally {
      activeAudits -= 1;
    }
  };
}
