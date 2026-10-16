// Live smoke: intentionally light, sequential requests against the user-configured engine.
import { lstat, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createAgentSession, DefaultResourceLoader, SessionManager, getAgentDir } from "@earendil-works/pi-coding-agent";
import { validateToolArguments } from "@earendil-works/pi-ai";

const rl = new DefaultResourceLoader({ cwd: process.cwd(), agentDir: getAgentDir(), noExtensions: true, additionalExtensionPaths: ["./index.ts"] });
await rl.reload();
const names = ["fastcrw_search", "fastcrw_scrape", "fastcrw_map", "fastcrw_crawl", "fastcrw_batch", "fastcrw_extract", "fastcrw_changes", "fastcrw_parse", "fastcrw_research"];
const { session, extensionsResult } = await createAgentSession({ resourceLoader: rl, sessionManager: SessionManager.inMemory(), tools: [...names, "fastcrw_monitor"] });
const tools = session.agent.state.tools;
let pass = 0, fail = 0, server = 0;
const upstream = (note: string) => /HTTP (503|504)|search_degraded|HTTP 422:.*pdf_parse_failed|(?:answer|summary) synthesis unavailable|could not answer/i.test(note);
const check = (name: string, ok: boolean, note = "") => {
  const engine = !ok && upstream(note);
  ok ? pass++ : engine ? server++ : fail++;
  console.log(`${ok ? "PASS" : engine ? "SERVER" : "FAIL"}  ${name}${note ? `  (${note})` : ""}`);
};
check("extension loads", extensionsResult.errors.length === 0, extensionsResult.errors.map(e => e.error).join("; "));
check("all 9 tools registered", names.every(n => tools.some(t => t.name === n)));
for (const name of names) check(`${name} schema no anyOf/oneOf/const`, !/"(anyOf|oneOf|const)"\s*:/.test(JSON.stringify(tools.find(t => t.name === name)?.parameters)));
// The hosted monitor tool exists only when a control-plane key is configured (never printed).
let fileMonitorKey = false;
try { fileMonitorKey = Boolean(JSON.parse(await readFile(process.env.FASTCRW_CONFIG || join(getAgentDir(), "fastcrw.json"), "utf8"))?.monitor?.apiKey); } catch { /* No config file. */ }
const monitorConfigured = Boolean(process.env.FASTCRW_MONITOR_API_KEY) || fileMonitorKey;
check(`fastcrw_monitor ${monitorConfigured ? "registered (monitor configured)" : "absent (monitor not configured)"}`, tools.some(t => t.name === "fastcrw_monitor") === monitorConfigured);

type R = { content: Array<{ type: string; text?: string; data?: string }>; details?: any; isError?: boolean };
const textOf = (r: R) => r.content.filter(c => c.type === "text").map(c => c.text).join("\n");
async function run(name: string, args: Record<string, unknown>, expect: (r: R, text: string) => boolean | string, label = "") {
  const t0 = Date.now(), updates: unknown[] = [];
  let last: R | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const tool = tools.find(t => t.name === name)!;
      const validated = validateToolArguments(tool, { id: "smoke", name, type: "toolCall", arguments: args as never });
      const r = await tool.execute("smoke", validated as never, undefined, u => updates.push(u)) as R;
      last = r;
      const text = textOf(r), v = expect(r, text);
      if (name === "fastcrw_search" && attempt === 0 && (r.isError || v !== true) && upstream(text)) {
        console.log(`RETRY  ${name} ${label}: search degraded; waiting 20 s`); await sleep(20_000); continue;
      }
      check(`${name} ${label}`, v === true && !r.isError, `${typeof v === "string" ? v + "; " : ""}${r.isError ? text.replace(/\s+/g, " ").slice(0, 650) + "; " : ""}${text.length} chars, ${updates.length} updates, ${Date.now() - t0} ms${r.isError ? ", isError" : ""}`);
      return r;
    } catch (e) {
      const message = (e as Error).message;
      if (name === "fastcrw_search" && attempt === 0 && upstream(message)) {
        console.log(`RETRY  ${name} ${label}: search degraded; waiting 20 s`); await sleep(20_000); continue;
      }
      check(`${name} ${label}`, false, `threw: ${message.slice(0, 700)}`); return last;
    }
  }
}
async function throws(label: string, fn: () => Promise<unknown> | unknown, re: RegExp) {
  try { await fn(); check(label, false, "did not throw"); } catch (e) { check(label, re.test((e as Error).message), (e as Error).message.slice(0, 140)); }
}
const has = (s: string) => (_: R, t: string) => t.includes(s) || `missing "${s}"`;
const schema = { type: "object", properties: { title: { type: "string" } }, required: ["title"] };
const example = "https://example.com", wiki = "https://en.wikipedia.org/wiki/Hello_World";
// Opt-in, one crawl only: npm run smoke -- --abort-only
if (process.argv.includes("--abort-only")) {
  const tool = tools.find(t => t.name === "fastcrw_crawl")!, controller = new AbortController();
  let jobId = "", rejected = false;
  const timer = setTimeout(() => controller.abort(), 1200), started = Date.now();
  try {
    await tool.execute("abort-smoke", { action: "start", url: "https://en.wikipedia.org/wiki/Web_crawler", maxPages: 40, maxDepth: 2, wait: true } as never,
      controller.signal, r => { jobId = (r.details as { jobId?: string })?.jobId || jobId; });
  } catch (error) { rejected = /aborted/i.test((error as Error).message); }
  finally { clearTimeout(timer); }
  check("live abort rejects after ~1.2 s", rejected && !!jobId, `jobId=${jobId || "not accepted"}, ${Date.now() - started} ms`);
  if (jobId) {
    let status = "";
    for (let i = 0; i < 6; i++) {
      const r = await tool.execute("abort-status", { action: "status", jobId } as never) as R;
      status = r.details?.status;
      if (["cancelled", "canceled"].includes(status)) break;
      await sleep(500);
    }
    check("live abort follow-up status is cancelled", ["cancelled", "canceled"].includes(status), `jobId=${jobId}, status=${status}`);
  }
  session.dispose();
  console.log(`\n${pass} passed, ${fail} failed, ${server} server-side errors (abort-only)`);
  process.exit(fail ? 1 : 0);
}
// Opt-in, hosted control plane, read-only actions only (no create/update/delete/run): npm run smoke -- --monitor
if (process.argv.includes("--monitor")) {
  if (!monitorConfigured) console.log("SKIP  fastcrw_monitor: no monitor.apiKey / FASTCRW_MONITOR_API_KEY configured");
  else {
    await run("fastcrw_monitor", { action: "balance" }, has("Hosted monitor balance"), "balance");
    const listed = await run("fastcrw_monitor", { action: "list" }, has("Hosted monitor list"), "list");
    const first = listed?.details?.fullResponse ? JSON.parse(await readFile(listed.details.fullResponse, "utf8"))?.data?.[0]?.id : undefined;
    if (typeof first === "string") {
      await run("fastcrw_monitor", { action: "get", id: first }, has("Hosted monitor get"), "get first monitor");
      await run("fastcrw_monitor", { action: "checks", id: first }, has("Hosted monitor checks"), "checks first monitor");
    } else console.log("SKIP  fastcrw_monitor get/checks: no monitors listed (none are created by smoke)");
  }
  session.dispose();
  console.log(`\n${pass} passed, ${fail} failed, ${server} server-side errors (monitor-only)`);
  process.exit(fail ? 1 : 0);
}
try {
  await run("fastcrw_search", { query: "pi coding agent site:pi.dev", limit: 2 }, has("1. "), "basic");
  await run("fastcrw_search", { query: "pi coding agent", limit: 2, answer: true }, has("Answer:"), "answer+citations (implicit scrapeOptions)");
  await run("fastcrw_search", { query: "example domain", limit: 1, scrape: true, lang: "en", tbs: "qdr:y", advanced: {
    scrapeFormats: ["markdown", "links"], scrapeOnlyMainContent: true, scrapeCountry: "us", scrapeTimeout: 15000,
    answerTopN: 1, maxCharsPerSource: 1000, maxContentChars: 2000, answerPrompt: "Be brief.", summaryPrompt: "One sentence.",
    answerTemperature: 0.2, queryExpand: false, queryExpandVariants: 1, multiRound: false, snippetFirst: true, answerListFormat: false,
  } }, has("1. "), "scrape enrichment + advanced tuning + tbs/lang");
  await run("fastcrw_search", { query: "web research", limit: 1, sources: ["news"], categories: ["research"] }, has("1. "), "news + categories");
  // The engine only summarizes web results (news returns executedSummaries:0), so test summaries on web.
  await run("fastcrw_search", { query: "web crawler", limit: 1, summarizeResults: true }, has("summary:"), "summarizeResults");
  await run("fastcrw_search", { query: "example domain", limit: 1, sources: ["images"] }, has("1. "), "image source normalization");
  await run("fastcrw_scrape", { url: example }, has("Example Domain"), "markdown");
  await run("fastcrw_scrape", { url: example, formats: ["html", "rawHtml", "plainText", "links", "images"] }, has("links:"), "html/rawHtml/plainText/links/images");
  await run("fastcrw_scrape", { url: example, formats: ["screenshot"], advanced: { screenshotFullPage: true } }, r => r.content.some(c => c.type === "image") || "no image block", "full-page screenshot");
  await run("fastcrw_scrape", { url: example, formats: ["json"], prompt: "Return the page title as {title}" }, has("json:"), "json prompt");
  await run("fastcrw_scrape", { url: example, formats: ["json"], jsonSchema: schema, advanced: { basis: true } }, has("json:"), "json schema + basis");
  await run("fastcrw_scrape", { url: example, formats: ["summary"], prompt: "One sentence.", advanced: { maxContentChars: 2000 } }, has("summary:"), "summary + byte cap");
  await run("fastcrw_scrape", { url: wiki, cssSelector: "h1" }, has("Hello World"), "cssSelector");
  await run("fastcrw_scrape", { url: wiki, xpath: "//h1" }, has("Hello World"), "xpath");
  await run("fastcrw_scrape", { url: wiki, includeTags: ["h1"], excludeTags: ["nav"] }, has("Hello World"), "include/excludeTags");
  await run("fastcrw_scrape", { url: example, renderJs: true, waitFor: 100, headers: { "Accept-Language": "en" } }, has("Example Domain"), "renderJs + waitFor + headers");
  await run("fastcrw_scrape", { url: example, query: "example domain", topK: 1, chunkStrategy: { type: "sentence", maxChars: 100, overlapChars: 10, dedupe: true }, filterMode: "bm25" }, has("Relevant chunks (1)"), "query/topK/chunkStrategy/filterMode");
  await run("fastcrw_scrape", { url: "https://en.wikipedia.org/wiki/Web_crawler", query: "politeness policy", topK: 2 }, has("Relevant chunks (2)"), "query/topK without chunkStrategy");
  await run("fastcrw_scrape", { url: example, maxAge: 0, storeInCache: false }, has("Example Domain"), "maxAge/storeInCache");
  await run("fastcrw_scrape", { url: example, advanced: { country: "us", renderer: "impersonated-http", stealth: true, deadlineMs: 15000, parsers: [] } }, has("Example Domain"), "advanced country/renderer/stealth/deadline/parsers");
  await run("fastcrw_map", { url: example, limit: 5, search: "EXAMPLE", includePaths: ["example.com"], excludePaths: ["not-present"], crawlFallback: true,
    advanced: { timeout: 30, ignoreQueryParameters: true, stripTrackingParams: true, dropActionUrls: true, extraTrackingParams: ["campaign"], extraActionParams: ["logout"], preserveParams: ["page"] } },
    (r, t) => (r.details?.count > 0 && t.includes("example.com")) || "no filtered links", "local search/include/exclude + advanced URL filters");
  const crawl = await run("fastcrw_crawl", { action: "start", url: example, maxPages: 1, maxDepth: 0, renderJs: false, waitFor: 0,
    headers: { "Accept-Language": "en" }, advanced: { renderer: "auto", country: "us" } }, (r) => r.details?.status === "completed" || "not completed", "start+wait + render/header options");
  if (crawl?.details?.jobId) {
    const jobId = crawl.details.jobId;
    await run("fastcrw_crawl", { action: "status", jobId, skip: 0, limit: 1 }, has("v2 status is paged"), "status skip/limit");
    await run("fastcrw_crawl", { action: "errors", jobId }, has("errors:"), "errors");
    await run("fastcrw_crawl", { action: "cancel", jobId }, has("already finished"), "cancel terminal no-op");
  }
  await run("fastcrw_crawl", { action: "active" }, has("Active crawl jobs"), "active");
  const detached = await run("fastcrw_crawl", { action: "start", url: example, maxPages: 1, wait: false }, r => !!r.details?.jobId, "start no-wait");
  if (detached?.details?.jobId) await run("fastcrw_crawl", { action: "cancel", jobId: detached.details.jobId }, has("crawl job"), "cancel detached");
  const batch = await run("fastcrw_batch", { action: "start", urls: [example, "https://pi.dev"], maxConcurrency: 1, ignoreInvalidUrls: true,
    formats: ["markdown"], onlyMainContent: true, renderJs: false, waitFor: 0, headers: { "Accept-Language": "en" }, waitSeconds: 120 },
    r => r.details?.status === "completed" || "not completed", "2 URLs start+wait");
  if (batch?.details?.jobId) {
    const jobId = batch.details.jobId;
    const page = await run("fastcrw_batch", { action: "status", jobId, skip: 0, limit: 1 }, (r, t) => t.includes("v2 status is paged") && r.details?.nextSkip === 1 || "missing bounded page/nextSkip", "status first page");
    if (page?.details?.nextSkip !== undefined) await run("fastcrw_batch", { action: "status", jobId, skip: page.details.nextSkip, limit: 1 }, has("batch job"), "status second page");
    await run("fastcrw_batch", { action: "errors", jobId }, has("errors:"), "errors");
    await run("fastcrw_batch", { action: "cancel", jobId }, has("already finished"), "cancel");
  }
  const ex = await run("fastcrw_extract", { action: "start", urls: [example], schema, basis: true, waitSeconds: 120 }, has("extract job"), "schema+basis start+wait");
  if (ex?.details?.jobId) await run("fastcrw_extract", { action: "status", jobId: ex.details.jobId }, has("extract job"), "status");
  const tag = `smoke-${crypto.randomUUID()}`;
  try {
    await run("fastcrw_changes", { mode: "url", url: example, tag }, (r, t) => r.details?.firstObservation === true && t.includes("baseline established"), "URL first observation");
    await run("fastcrw_changes", { mode: "url", url: example, tag, goal: "Notice title changes", judgeEnabled: true }, r => r.details?.status === "same" && r.details?.persisted === true || "expected same persisted baseline", "URL second same + judge opt-in");
    await run("fastcrw_scrape", { url: example, advanced: { changeTracking: { tag, modes: ["gitDiff"], contentType: "text/html" }, goal: "Notice title changes", judgeEnabled: false } },
      r => r.details?.status === "same" && r.details?.persisted === true || "inline scrape did not share baseline", "advanced tracking shares changes baseline");
    const listing = await run("fastcrw_changes", { mode: "list", tag }, (r, t) => r.details?.count === 1 && !t.includes("Example Domain"), "list metadata only");
    if (listing?.details?.fullResponse) {
      const rows = JSON.parse(await readFile(listing.details.fullResponse, "utf8")).snapshots;
      const st = await lstat(rows[0].path), dirStat = await lstat(join(rows[0].path, ".."));
      check("snapshot permissions file 0600 / directory 0700", (st.mode & 0o777) === 0o600 && (dirStat.mode & 0o777) === 0o700);
    }
  } finally { await run("fastcrw_changes", { mode: "forget", url: example, tag }, (r) => r.details?.count === 1, "forget unique baseline"); }
  await run("fastcrw_changes", { mode: "list", tag }, r => r.details?.count === 0, "unique baseline cleanup verified");
  await run("fastcrw_changes", { mode: "diff", previous: { markdown: "Hello old world" }, current: { markdown: "Hello new world" }, modes: ["gitDiff"] }, has('"changed"'), "inline snapshot diff");
  await run("fastcrw_changes", { mode: "diff", batch: [{ previous: { markdown: "same" }, current: { markdown: "same" } }, { previous: { json: { title: "old" } }, current: { json: { title: "new" } }, modes: ["json"] }] }, has('"changed"'), "batch markdown/JSON diff");
  const dir = await mkdtemp(join(tmpdir(), "fastcrw-smoke-pdf-"));
  try {
    // Valid tiny one-page PDF with computed xref offsets (no external generator dependency).
    const stream = "BT /F1 12 Tf 72 720 Td (Hello fastCRW) Tj ET";
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
    let pdf = "%PDF-1.4\n", offsets = [0];
    objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const path = join(dir, "tiny.pdf"); await writeFile(path, pdf, { mode: 0o600 });
    await run("fastcrw_parse", { path, formats: ["markdown"], parsers: [{ type: "pdf", mode: "fast", maxPages: 1 }], maxContentChars: 1000 }, has("Hello fastCRW"), "multipart generated PDF (422 pdf_parse_failed is SERVER)");
  } finally { await rm(dir, { recursive: true, force: true }); }
  await run("fastcrw_research", { action: "papers", query: "attention is all you need", k: 1, categories: "cs", from: "2017-01-01", to: "2026-12-31", authors: "Vaswani" }, has("Research papers"), "papers + filters");
  await run("fastcrw_research", { action: "paper", id: "arxiv:1706.03762", query: "attention mechanism", k: 1 }, has("abstract sentences"), "paper abstract passages");
  await run("fastcrw_research", { action: "similar", id: "arxiv:1706.03762", intent: "attention mechanisms", mode: "references", k: 1 }, has("Research similar"), "similar/references");
  await run("fastcrw_research", { action: "github", query: "pi coding agent", k: 1 }, has("Research github"), "github README");
  const scrapeTool = tools.find(t => t.name === "fastcrw_scrape")!;
  const saved = { ...process.env };
  try {
    process.env.CRW_API_KEY = "definitely-wrong";
    await throws("bad key -> 401 hint", () => scrapeTool.execute("x", { url: example } as never), /401.*CRW_API_KEY/);
    if (saved.CRW_API_KEY) process.env.CRW_API_KEY = saved.CRW_API_KEY; else delete process.env.CRW_API_KEY;
    process.env.CRW_API_URL = "http://not-loopback.example";
    await throws("plain http non-loopback rejected", () => scrapeTool.execute("x", { url: example } as never), /HTTPS/);
  } finally {
    for (const name of ["CRW_API_URL", "CRW_API_KEY"]) if (saved[name]) process.env[name] = saved[name]; else delete process.env[name];
  }
  await throws("non-http page URL rejected", () => scrapeTool.execute("x", { url: "file:///etc/passwd" } as never), /HTTP/);
  await throws("regex chunk requires pattern", () => scrapeTool.execute("x", { url: example, chunkStrategy: { type: "regex" } } as never), /requires pattern/);
  await throws("basis requires schema", () => scrapeTool.execute("x", { url: example, advanced: { basis: true } } as never), /requires jsonSchema/);
  const rt = tools.find(t => t.name === "fastcrw_research")!;
  await throws("research k minimum enforced by schema", () => validateToolArguments(rt, { id: "x", name: rt.name, type: "toolCall", arguments: { action: "github", query: "pi", k: 0 } }), /minimum|>=|1/);
} finally { session.dispose(); }
console.log(`\n${pass} passed, ${fail} failed, ${server} server-side errors (engine, not extension)`);
process.exit(fail ? 1 : 0);
