// Live smoke test: exercises every implemented feature against your configured engine.
// Usage: npm run smoke   (uses CRW_API_URL/CRW_API_KEY or ~/.pi/agent/fastcrw.json)
import { createAgentSession, DefaultResourceLoader, SessionManager, getAgentDir } from "@earendil-works/pi-coding-agent";

const rl = new DefaultResourceLoader({ cwd: process.cwd(), agentDir: getAgentDir(), noExtensions: true, additionalExtensionPaths: ["./index.ts"] });
await rl.reload();
const names = ["fastcrw_search", "fastcrw_scrape", "fastcrw_map", "fastcrw_crawl", "fastcrw_extract"];
const { session, extensionsResult } = await createAgentSession({ resourceLoader: rl, sessionManager: SessionManager.inMemory(), tools: names });
const tools = session.agent.state.tools;
let pass = 0, fail = 0, server = 0;
const check = (name: string, ok: boolean, note = "") => {
  // Engine-side outages (degraded search backend, upstream timeouts) are reported separately from extension bugs.
  const upstream = !ok && /HTTP (503|504)|search_degraded|answer synthesis unavailable|could not answer/.test(note);
  ok ? pass++ : upstream ? server++ : fail++;
  console.log(`${ok ? "PASS" : upstream ? "SERVER" : "FAIL"}  ${name}${note ? `  (${note})` : ""}`);
};

check("extension loads", extensionsResult.errors.length === 0, extensionsResult.errors.map(e => e.error).join("; "));
check("all 5 tools registered", names.every(n => tools.some(t => t.name === n)));
check("schemas have no anyOf/oneOf/const", tools.every(t => !/"(anyOf|oneOf|const)"/.test(JSON.stringify(t.parameters))));

type R = { content: Array<{ type: string; text?: string; data?: string }>; details?: any; isError?: boolean };
async function run(name: string, args: Record<string, unknown>, expect: (r: R, text: string) => boolean | string, label = "") {
  const t0 = Date.now(), updates: unknown[] = [];
  try {
    const r = await tools.find(t => t.name === name)!.execute("smoke", args as never, undefined, u => updates.push(u)) as R;
    const text = r.content.filter(c => c.type === "text").map(c => c.text).join("\n");
    const v = expect(r, text);
    check(`${name} ${label}`, v === true && !r.isError, `${typeof v === "string" ? v + "; " : ""}${r.isError ? text.slice(0, 160).replace(/\s+/g, " ") + "; " : ""}${text.length} chars, ${updates.length} updates, ${Date.now() - t0} ms${r.isError ? ", isError" : ""}`);
    return r;
  } catch (e) { check(`${name} ${label}`, false, `threw: ${(e as Error).message.slice(0, 200)}`); }
}
async function throws(label: string, fn: () => Promise<unknown>, re: RegExp) {
  try { await fn(); check(label, false, "did not throw"); } catch (e) { check(label, re.test((e as Error).message), (e as Error).message.slice(0, 120)); }
}

const has = (s: string) => (_: R, t: string) => t.includes(s) || `missing "${s}"`;
await run("fastcrw_search", { query: "pi coding agent", limit: 3 }, has("1. "), "basic");
await run("fastcrw_search", { query: "pi coding agent", limit: 3, answer: true }, has("Answer:"), "answer+citations");
await run("fastcrw_search", { query: "example domain iana", limit: 2, scrape: true }, has("untrusted-web-content"), "scrape results");
await run("fastcrw_search", { query: "rust web crawler", limit: 2, tbs: "qdr:y", lang: "en" }, has("1. "), "tbs+lang");
await run("fastcrw_scrape", { url: "https://example.com" }, has("Example Domain"), "markdown");
await run("fastcrw_scrape", { url: "https://example.com", formats: ["html", "rawHtml", "plainText", "links", "images"] }, has("links:"), "html/rawHtml/plainText/links/images");
await run("fastcrw_scrape", { url: "https://example.com", formats: ["screenshot"] }, r => r.content.some(c => c.type === "image") || "no image block", "screenshot");
await run("fastcrw_scrape", { url: "https://example.com", formats: ["json"], prompt: "Return the page title as {title}" }, has("json:"), "json via prompt");
await run("fastcrw_scrape", { url: "https://example.com", formats: ["json"], jsonSchema: { type: "object", properties: { title: { type: "string" } } } }, has("json:"), "json via schema");
await run("fastcrw_scrape", { url: "https://example.com", formats: ["summary"], prompt: "One sentence." }, has("summary:"), "summary");
await run("fastcrw_scrape", { url: "https://en.wikipedia.org/wiki/Hello_World", cssSelector: "h1" }, has("Hello World"), "cssSelector");
await run("fastcrw_scrape", { url: "https://en.wikipedia.org/wiki/Hello_World", xpath: "//h1" }, has("Hello World"), "xpath");
await run("fastcrw_scrape", { url: "https://en.wikipedia.org/wiki/Hello_World", includeTags: ["h1"], excludeTags: ["nav"] }, has("Hello World"), "includeTags/excludeTags");
await run("fastcrw_scrape", { url: "https://example.com", renderJs: true, waitFor: 500 }, has("Example Domain"), "renderJs+waitFor");
await run("fastcrw_map", { url: "https://example.com", limit: 20 }, has("URLs"), "map");
await run("fastcrw_crawl", { action: "start", url: "https://example.com", maxPages: 2, maxDepth: 1 }, (r, t) => t.includes("completed") || r.details?.status, "start+wait");
const started = await run("fastcrw_crawl", { action: "start", url: "https://example.com", maxPages: 1, wait: false }, r => !!r.details?.jobId || "no jobId", "start no-wait");
if (started?.details?.jobId) {
  await run("fastcrw_crawl", { action: "status", jobId: started.details.jobId }, has("crawl job"), "status");
  await run("fastcrw_crawl", { action: "cancel", jobId: started.details.jobId }, () => true, "cancel");
}
const ex = await run("fastcrw_extract", { action: "start", urls: ["https://example.com"], prompt: "Extract the page title", waitSeconds: 120 }, has("extract job"), "start+wait");
if (ex?.details?.jobId) await run("fastcrw_extract", { action: "status", jobId: ex.details.jobId }, has("extract job"), "status");

const scrapeTool = tools.find(t => t.name === "fastcrw_scrape")!;
const saved = { ...process.env };
process.env.CRW_API_KEY = "definitely-wrong";
await throws("bad key -> 401 hint", () => scrapeTool.execute("x", { url: "https://example.com" } as never), /401.*CRW_API_KEY/);
process.env.CRW_API_KEY = saved.CRW_API_KEY ?? ""; if (!saved.CRW_API_KEY) delete process.env.CRW_API_KEY;
process.env.CRW_API_URL = "http://not-loopback.example";
await throws("plain http to non-loopback rejected", () => scrapeTool.execute("x", { url: "https://example.com" } as never), /HTTPS/);
if (saved.CRW_API_URL) process.env.CRW_API_URL = saved.CRW_API_URL; else delete process.env.CRW_API_URL;
await throws("non-http page url rejected", () => scrapeTool.execute("x", { url: "file:///etc/passwd" } as never), /HTTP/);

session.dispose();
console.log(`\n${pass} passed, ${fail} failed, ${server} server-side errors (engine, not extension)`);
process.exit(fail ? 1 : 0);
