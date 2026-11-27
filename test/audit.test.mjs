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

test("Gemini suggestions use verified page indices and a failed call falls back to rules", async () => {
  const pages = [{ url: "https://studio.example/contact", title: "Example Studio", description: "Public quote form", content: "Request a quote or reach our team.", form: true }];
  const suggestion = {
    category: "leads", title: "Route new quote requests", reason: "A quote form is visible.", effort: 1, impact: 5, aiFit: 4,
    steps: ["Read a submission", "Classify its topic", "Check the output", "Send internally"], stack: ["Email"], risks: ["Require review"], sources: [0, 8],
  };
  const result = await makeAudit({ domain: "studio.example", pages }, { apiKey: "test-only", fetch: async (url, options) => {
    assert.match(url, /generateContent$/);
    assert.equal(options.headers["x-goog-api-key"], "test-only");
    const payload = JSON.parse(options.body);
    assert.ok(payload.generationConfig.responseJsonSchema);
    const response = { company: "Example Studio", summary: "A studio with a quote form.", opportunities: [suggestion] };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }] }), { status: 200 });
  } });
  assert.equal(result.mode, "gemini");
  assert.equal(result.opportunities[0].title, suggestion.title);
  assert.deepEqual(result.opportunities[0].evidence.map(({ url }) => url), [pages[0].url]);

  const fallback = await makeAudit({ domain: "studio.example", pages }, { apiKey: "test-only", fetch: async () => new Response(null, { status: 429 }) });
  assert.equal(fallback.mode, "rules");
  assert.equal(fallback.modelUnavailable, true);
  assert.ok(fallback.opportunities.length);
});
