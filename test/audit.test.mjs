import assert from "node:assert/strict";
import test from "node:test";
import { crawlSite, normalizeSite } from "../lib/crawl.mjs";
import { makeAudit, sampleAudit } from "../lib/audit.mjs";
import { createApi } from "../lib/api.mjs";

const fixturePages = {
  "/": "<title>Example Studio | Services</title><main><h1>Website design</h1><p>Our agency designs sites for professional services.</p><a href='/contact'>Contact</a><a href='https://other.example/contact'>Partner</a><a href='/private/'>Unlisted</a></main>",
  "/contact": "<title>Contact</title><main><form><input type=email><label>Request a quote for your project and tell us about the work.</label></form><a href='/support'>Support</a></main>",
  "/support": "<title>FAQ</title><main><h1>Frequently asked questions</h1><p>Find approved answers for questions about your project timeline.</p></main>",
};

test("crawl collects public evidence across pages and respects site boundaries and rules", async () => {
  const visited = [];
  const request = async (url, _signal, allowed) => {
    visited.push(url);
    if (url.pathname === "/robots.txt") return { url, status: 200, headers: { "content-type": "text/plain" }, body: Buffer.from("User-agent: *\nDisallow: /private/\nSitemap: https://studio.example/public-pages.xml") };
    assert.equal(allowed(url), true);
    assert.equal(allowed(new URL("https://www.studio.example/private/")), false);
    if (url.pathname === "/public-pages.xml") return { url, status: 200, headers: { "content-type": "application/xml" }, body: Buffer.from("<urlset><url><loc>https://studio.example/support</loc></url></urlset>") };
    const content = fixturePages[url.pathname];
    return { url, status: content ? 200 : 404, headers: { "content-type": "text/html" }, body: Buffer.from(content ?? "") };
  };
  const audit = await makeAudit(await crawlSite("studio.example", { request }));
  assert.equal(audit.company, "Example Studio");
  assert.equal(audit.pages.length, 3);
  assert.equal(audit.opportunities.length, 3);
  assert.ok(visited.some((url) => url.pathname === "/public-pages.xml"));
  assert.ok(visited.every((url) => url.hostname === "studio.example" && url.pathname !== "/private/"));
  assert.ok(audit.opportunities.every((item) => item.evidence.length && item.steps.length === 4));
  assert.match(audit.opportunities[0].evidence[0].excerpt, /request a quote/i);
  assert.ok(audit.opportunities[0].score >= audit.opportunities[1].score);
});

test("invalid addresses fail before a crawl starts", () => {
  for (const invalid of ["", "localhost", "https://127.0.0.1/", "https://example.com:444/", "file:///example", "https://user@example.com/"]) {
    assert.throws(() => normalizeSite(invalid), /website/);
  }
});

test("sparse public evidence yields no invented estimates or opportunities", async () => {
  const result = await makeAudit({ domain: "example.com", pages: [{ url: "https://example.com/", title: "Example Domain", description: "A domain for examples.", content: "This domain is reserved for examples and documentation.", form: false }] });
  assert.deepEqual(result.opportunities, []);
  assert.equal(result.business, null);
  const sample = await sampleAudit();
  assert.equal(sample.mode, "sample");
  assert.equal(sample.opportunities.length, 3);
  assert.equal(sample.opportunities[0].estimate, undefined);
});

test("core product pages outweigh incidental topics and drive three distinct workflows", async () => {
  const makePage = (path, title, content) => ({ url: `https://wallet.example${path}`, title, description: "", content, form: false });
  const pages = [
    makePage("/", "Example Wallet", "Send money with a digital wallet. Use virtual cards to make purchases."),
    makePage("/complaint-resolution", "Complaints and Disputes", "Read how to dispute a transaction."),
    makePage("/blog/gift-cards", "Online retail shop and free shipping", "Add to cart, free shipping, returns policy, and order tracking."),
  ];
  const result = await makeAudit({ domain: "wallet.example", pages });
  assert.equal(result.business.label, "Payments and digital financial services");
  assert.equal(result.business.source.url, pages[0].url);
  assert.deepEqual(result.opportunities.map(({ id }) => id), ["transfer-guidance", "payment-disputes", "card-onboarding"]);
  assert.ok(result.opportunities.every(({ coreFit, evidence }) => coreFit && evidence.every(({ url }) => !url.includes("/blog/"))));
});

test("retail business summaries feature catalog items over promotions", async () => {
  const pages = [{
    url: "https://shop.example/", title: "Example Shop", description: "Free shipping on most orders.",
    content: "Shop all. Free shipping. SHOP WAXED CANVAS BAGS", snippets: ["SHOP BLACK FRIDAY", "Free shipping on most orders.", "SHOP WAXED CANVAS BAGS"],
    form: false,
  }];
  const result = await makeAudit({ domain: "shop.example", pages });
  assert.equal(result.business.label, "Online retail");
  assert.equal(result.summary, "Featured products include waxed canvas bags.");
});

test("hosted handler and local adapter use the same bounded API", async () => {
  const endpoint = "https://demo.example/api/audit";
  const api = createApi({ apiKey: "", crawl: async (url) => {
    assert.equal(url, "example.com");
    return { domain: url, pages: [{ url: `https://${url}/`, title: "Example", description: "Example website.", content: "A domain for examples.", form: false }] };
  } });
  const post = (data, origin = "https://demo.example") => api(new Request(endpoint, {
    method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(data),
  }));
  assert.equal((await post({ url: "example.com" }, "https://unrelated.example")).status, 403);
  assert.equal((await post({ url: "a".repeat(5000) })).status, 400);
  const response = await post({ url: "example.com" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).company, "Example");
});

const aiSite = {
  domain: "studio.example",
  pages: [{
    url: "https://studio.example/contact", title: "Example Studio", description: "Public quote form",
    content: "Request a quote for web design. Include your project timeline, budget, and existing website.", form: true,
  }],
};
const apiKey = "test-only-key";
const sampleQuote = { index: 0, quote: "Request a quote for web design." };
const aiSuggestion = {
  category: "other", title: "Check scope before drafting quotes", reason: "A quote form is visible.", effort: 2, impact: 4, aiFit: 4,
  steps: ["Read a submission", "Classify its scope", "Check the output", "Save a draft"], stack: ["Email"], risks: ["Require review"],
  evidence: [sampleQuote, { index: 8, quote: sampleQuote.quote }],
};
const aiResponse = {
  company: "Example Studio", summary: "A web design studio with a custom quote form.",
  businessLabel: "Web design services", businessEvidence: [sampleQuote],
  opportunities: [
    aiSuggestion,
    { ...aiSuggestion, title: "Prepare a project timeline", evidence: [{ index: 0, quote: "Include your project timeline, budget, and existing website." }] },
    { ...aiSuggestion, title: "Draft a site handoff checklist" },
  ],
};
const wrapResponse = {
  gemini: (text) => ({ candidates: [{ content: { parts: [{ thought: true, text: "reasoning" }, { text }] } }] }),
  claude: (text) => ({ content: [{ type: "text", text }] }),
  openai: (text) => ({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text }] }] }),
};
const auditRequest = (body) => new Request("https://demo.example/api/audit", {
  method: "POST", headers: { "content-type": "application/json", origin: "https://demo.example" }, body: JSON.stringify(body),
});

for (const [provider, host, credentialHeader] of [
  ["gemini", "generativelanguage.googleapis.com", "x-goog-api-key"],
  ["claude", "api.anthropic.com", "x-api-key"],
  ["openai", "api.openai.com", "Authorization"],
]) {
  test(`${provider} uses a one-scan key and returns three verified AI suggestions`, async () => {
    let calls = 0;
    const api = createApi({ apiKey: "", crawl: async () => aiSite, fetchModel: async (url, options) => {
      calls += 1;
      assert.equal(new URL(url).host, host);
      assert.equal(options.redirect, "error");
      assert.equal(options.headers[credentialHeader], provider === "openai" ? `Bearer ${apiKey}` : apiKey);
      assert.ok(options.body.includes("Request a quote for web design."));
      assert.ok(!options.body.includes(apiKey));
      const payload = JSON.parse(options.body);
      if (provider === "openai") assert.equal(payload.store, false);
      const shape = payload.generationConfig?.responseJsonSchema ?? payload.output_config?.format.schema ?? payload.text?.format.schema;
      assert.equal(shape.additionalProperties, false);
      return Response.json(wrapResponse[provider](JSON.stringify(aiResponse)));
    } });
    const result = await api(auditRequest({ url: aiSite.domain, ai: { provider, apiKey, endpoint: "https://unrelated.example" } }));
    const text = await result.text();
    assert.ok(!text.includes(apiKey));
    const report = JSON.parse(text);
    assert.equal(report.mode, provider);
    assert.equal(report.business.label, aiResponse.businessLabel);
    assert.equal(report.opportunities.length, 3);
    assert.ok(report.opportunities.every(({ origin }) => origin === "ai"));
    assert.deepEqual(report.opportunities[0].evidence, [{ title: "Example Studio", url: aiSite.pages[0].url, excerpt: sampleQuote.quote }]);
    const next = await api(auditRequest({ url: aiSite.domain }));
    assert.equal((await next.json()).mode, "rules");
    assert.equal(calls, 1);
  });
}

test("rejected keys and unsupported evidence fall back without exposing provider errors", async () => {
  for (const [issue, response] of [
    ["access", new Response(`Rejected ${apiKey}`, { status: 401 })],
    ["limit", new Response(null, { status: 429 })],
    ["evidence", Response.json(wrapResponse.gemini(JSON.stringify({
      ...aiResponse, opportunities: [{ ...aiSuggestion, evidence: [{ index: 0, quote: "The company offers free express shipping." }] }],
    })))],
  ]) {
    const report = await makeAudit(aiSite, { apiKey, fetch: async () => response });
    assert.equal(report.mode, "rules");
    assert.equal(report.analysisProvider, "gemini");
    assert.equal(report.modelIssue, issue);
    assert.ok(report.opportunities.length);
    assert.ok(!JSON.stringify(report).includes(apiKey));
  }
  const api = createApi({ crawl: async () => assert.fail("An invalid provider must fail before crawling") });
  const rejected = await api(auditRequest({ url: aiSite.domain, ai: { provider: "https://unrelated.example", apiKey } }));
  assert.equal(rejected.status, 400);
  assert.ok(!(await rejected.text()).includes(apiKey));
});
