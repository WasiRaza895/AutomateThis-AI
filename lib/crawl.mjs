import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { load, loadBuffer } from "cheerio";
import ipaddr from "ipaddr.js";
import robotsParser from "robots-parser";

const agent = "AutomateThisAI";
const maximumPages = 8;
const maximumAttempts = 12;
const byteLimit = 640 * 1024;
const pagePriority = /(?:about|services?|products?|solutions?|pricing|contact|help|support|faq|book|appointment|onboard)/i;
const skipPaths = /(?:\/wp-admin|\/search(?:\/|$)|\/logout|\/sign-?in|\/login|\/account(?:\/|$)|\/cart|\/checkout|\/tags?\/|\.(?:pdf|png|jpe?g|svg|zip|mp4|xml)$)/i;

export class AuditError extends Error {}

export function normalizeSite(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 1000) {
    throw new AuditError("Enter a company website, for example example.com.");
  }
  try {
    const input = value.trim();
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    if (!validPage(url)) throw new Error();
    url.hash = "";
    url.search = "";
    return url;
  } catch {
    throw new AuditError("Enter a public HTTP or HTTPS website with a domain name.");
  }
}

function validPage(url) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  return ["http:", "https:"].includes(url.protocol) && host.includes(".") && !isIP(host)
    && !url.username && !url.password && !url.port && !host.endsWith(".");
}

function siteHost(url) {
  return url.hostname.replace(/^www\./, "");
}

function publicAddress(address) {
  return ipaddr.process(address).range() === "unicast";
}

function abortable(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function fetchPage(url, signal, allowed = () => true, originalHost = siteHost(url), redirects = 0) {
  if (!validPage(url) || siteHost(url) !== originalHost) {
    throw new AuditError("The website redirected outside the selected domain.");
  }
  if (!allowed(url)) throw new AuditError("This website’s crawl rules restrict automated access.");
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(6000)]);
  const addresses = await abortable(lookup(url.hostname, { all: true, verbatim: true }), timeout);
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
    throw new AuditError("That website does not resolve to public internet addresses.");
  }
  const result = await new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.get(url, {
      signal: timeout,
      agent: false,
      lookup: (_host, options, callback) => {
        const matching = addresses.filter(({ family }) => !options.family || options.family === family);
        if (!matching.length) return callback(new Error("No public address is available for this request."));
        if (options.all) return callback(null, matching);
        return callback(null, matching[0].address, matching[0].family);
      },
      headers: { "User-Agent": `${agent}/1.0`, Accept: "text/html,application/xhtml+xml,application/xml,text/plain", "Accept-Encoding": "identity" },
    }, (response) => {
      const { statusCode: status, headers } = response;
      if (status < 200 || status >= 300) {
        response.destroy();
        resolve({ status, headers, body: Buffer.alloc(0), url });
        return;
      }
      let size = 0;
      const chunks = [];
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > byteLimit) request.destroy(new AuditError("A website response exceeded the scan size limit."));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve({ status, headers, body: Buffer.concat(chunks), url }));
      response.on("error", reject);
    });
    request.on("error", reject);
  });
  if (result.status >= 300 && result.status < 400 && result.headers.location) {
    if (redirects >= 3) throw new AuditError("The website returned too many redirects.");
    return fetchPage(new URL(result.headers.location, url), signal, allowed, originalHost, redirects + 1);
  }
  return result;
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function parseHtml(page) {
  if (page.status !== 200 || !/html/i.test(page.headers["content-type"] ?? "")) return null;
  const $ = loadBuffer(page.body);
  const title = cleanText($("title").first().text() || $("h1").first().text()).slice(0, 140) || page.url.pathname;
  const description = cleanText($("meta[name=description]").attr("content") || "").slice(0, 260);
  const links = $("a[href]").map((_i, element) => $(element).attr("href")).get();
  const form = $("form").filter((_i, element) => $(element).find("textarea, input[type=email]").length > 0).length > 0;
  $("script,style,template,noscript,svg,nav,footer,[hidden],[aria-hidden=true]").remove();
  const main = $("main").first();
  const scope = main.length ? main : $("body");
  const sections = scope.find("h1,h2,h3,p,li,dt,dd,label").map((_i, element) => $(element).text()).get();
  const content = cleanText(sections.join(" ") || scope.text()).slice(0, 3200);
  if (content.length < 30 && !description) return null;
  return { title, description, content, form, links, url: page.url.href };
}

function relevantLink(href, base, origin, allowSitemap = false) {
  try {
    const url = new URL(href, base);
    if (!validPage(url) || siteHost(url) !== siteHost(origin) || (!allowSitemap && skipPaths.test(url.pathname))) return null;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

async function sitemapLinks(robots, origin, request, signal) {
  const candidate = robots.getSitemaps().map((href) => relevantLink(href, origin, origin, true))
    .find(Boolean) ?? new URL("/sitemap.xml", origin);
  if (robots.isAllowed(candidate.href, agent) === false) return [];
  const page = await request(candidate, signal).catch(() => null);
  if (!page || page.status !== 200 || !/xml/i.test(page.headers["content-type"] ?? "")) return [];
  const $ = load(page.body.toString("utf8"), { xml: true });
  return $("url > loc").map((_i, node) => $(node).text().trim()).get()
    .filter((href) => pagePriority.test(href)).slice(0, 30);
}

export async function crawlSite(input, { request = fetchPage } = {}) {
  const origin = normalizeSite(input);
  const signal = AbortSignal.timeout(22000);
  const robotsUrl = new URL("/robots.txt", origin);
  const robotsPage = await request(robotsUrl, signal).catch(() => null);
  if ([401, 403].includes(robotsPage?.status)) throw new AuditError("This website restricts automated access.");
  const robotsText = robotsPage?.status === 200 ? robotsPage.body.toString("utf8") : "";
  const robots = robotsParser(robotsUrl.href, robotsText);
  const allowed = (url) => robots.isAllowed(new URL(url.pathname + url.search, origin).href, agent) !== false;
  const read = (url, requestSignal) => request(url, requestSignal, allowed);
  if (!allowed(origin)) throw new AuditError("This website’s crawl rules restrict automated access.");

  let first;
  try {
    first = parseHtml(await read(origin, signal));
  } catch (error) {
    if (error instanceof AuditError) throw error;
    throw new AuditError("The website could not be reached. Check the address and try again.");
  }
  if (!first) throw new AuditError("The website did not provide readable public HTML. Try another public page on the same site.");
  if (!allowed(new URL(first.url))) throw new AuditError("This website’s crawl rules restrict automated access.");

  const pages = [first];
  const visited = new Set([origin.href, first.url]);
  const queue = new Map();
  function discover(links, base) {
    for (const href of links) {
      const link = relevantLink(href, base, origin);
      if (link && !visited.has(link.href) && !queue.has(link.href) && allowed(link)) {
        queue.set(link.href, link);
      }
    }
  }

  discover(first.links, first.url);
  if ([...queue.values()].filter((url) => pagePriority.test(url.pathname)).length < 4) {
    discover(await sitemapLinks(robots, new URL(first.url), read, signal), first.url);
  }
  let attempts = 1;
  while (queue.size && pages.length < maximumPages && attempts < maximumAttempts && !signal.aborted) {
    const batch = [...queue.values()].sort((a, b) => Number(pagePriority.test(b.pathname)) - Number(pagePriority.test(a.pathname)))
      .slice(0, Math.min(3, maximumPages - pages.length, maximumAttempts - attempts));
    for (const link of batch) {
      queue.delete(link.href);
      visited.add(link.href);
    }
    attempts += batch.length;
    const parsed = await Promise.all(batch.map((link) => read(link, signal).then(parseHtml).catch(() => null)));
    for (const page of parsed) {
      if (!page || pages.some(({ url }) => url === page.url) || !allowed(new URL(page.url))) continue;
      pages.push(page);
      visited.add(page.url);
      queue.delete(page.url);
      discover(page.links, page.url);
    }
  }
  return { domain: siteHost(origin), pages: pages.map(({ links, ...page }) => page) };
}
