// Offline integration tests: real pi loader/validator/runtime, loopback engine only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { mkdtemp, readFile, writeFile, stat, readdir, rm, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
const home = await mkdtemp(join(tmpdir(), "fastcrw-test-"));
process.env.HOME = home;
process.env.PI_CODING_AGENT_DIR = join(home, ".pi/agent");
process.env.PI_OFFLINE = "1";
process.env.FASTCRW_CONFIG = join(home, "config.json");
process.env.FASTCRW_HOME = join(home, "store");
for (const k of ["CRW_API_KEY", "FASTCRW_API_KEY", "CRW_API_URL", "FASTCRW_API_URL"]) delete process.env[k];
// Defense in depth: an accidental external fetch fails, never leaves the machine.
globalThis.fetch = ((input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "offline test attempted non-loopback fetch");
  return originalFetch(input, init);
}) as typeof fetch;
const key = "offline-engine-secret-123", llmKey = "offline-llm-secret-456";
type Obj = Record<string, any>;
type Hit = { method: string; url: string; headers: IncomingHttpHeaders; text: string; body: Obj };
type Reply = { code?: number; body?: Obj; headers?: Record<string, string> };
const hits: Hit[] = [], spillDirs = new Set<string>();
let responder: ((hit: Hit) => Reply | undefined) | undefined;
const capabilityBody: Obj = { limits: { searchMaxLimit: 2, maxBatchUrls: 2, maxExtractUrls: 2 }, renderers: { available: ["auto", "impersonated-http"] }, documents: { fileUpload: { maxBytes: 4096 } } };
let trackingVersion = "old", jobStatus = "completed", jobCounter = 0, redirected = 0;
const receiver = createServer((_req, res) => { redirected++; res.end("{}"); });
await new Promise<void>(r => receiver.listen(0, "127.0.0.1", r));
const receiverPort = (receiver.address() as { port: number }).port;
const server = createServer(async (req, res) => {
  try {
    const parts: Buffer[] = [];
    for await (const chunk of req) parts.push(Buffer.from(chunk));
    const text = Buffer.concat(parts).toString();
    let body: Obj = {};
    try { body = JSON.parse(text); } catch { /* Multipart or empty. */ }
    const hit = { method: req.method!, url: req.url!, headers: req.headers, text, body };
    hits.push(hit);
    const path = hit.url.replace(/^\/fallback/, "");
    let reply = responder?.(hit);
    if (!reply) {
      if (path === "/v1/capabilities") reply = { body: capabilityBody };
      else if (path === "/v1/search") reply = { body: { success: true, data: { results: { web: [{ title: "Web", url: "https://page.example", markdown: "HIDDEN_MARKDOWN", summary: "short" }], news: [{ title: "News" }], images: [{ title: "Image" }] }, answer: "A cited answer" } } };
      else if (path === "/v1/scrape") {
        const tracking = body.changeTracking;
        reply = { body: { success: true, data: { markdown: trackingVersion, ...(tracking ? { changeTracking: {
          status: !tracking.previous || tracking.previous.contentHash === trackingVersion ? "same" : "changed", firstObservation: !tracking.previous,
          snapshot: { markdown: trackingVersion, contentHash: trackingVersion, capturedAt: "2026-01-01" }, diff: "difference",
        } } : {}) } } };
      } else if (path === "/v1/map") reply = { body: { data: { links: ["https://page.example/a", "https://page.example/b"] } } };
      else if (path === "/v1/change-tracking/diff") reply = { body: { data: { status: "changed", diff: "-old +new" } } };
      else if (path === "/v2/parse") reply = { body: { data: { markdown: "parsed PDF", metadata: { pages: 1 } } } };
      else if (path.startsWith("/v1/search/research/")) reply = { body: { data: { results: [{ title: "Paper" }] } } };
      else if (path === "/v2/crawl/active") reply = { body: { crawls: [] } };
      else if (path.endsWith("/errors")) reply = { body: { errors: [] } };
      else if (/^\/v1\/(crawl|batch\/scrape|extract)$/.test(path) && hit.method === "POST") reply = { body: { id: `job-${++jobCounter}`, status: "processing" } };
      else if (/^\/v[12]\/(crawl|batch\/scrape|extract)\//.test(path)) {
        if (hit.method === "DELETE") reply = jobStatus === "completed" ? { code: 400, body: { error: "Job already finished" } } : { body: { status: "cancelled" } };
        else reply = { body: { status: jobStatus, completed: jobStatus === "completed" ? 2 : 0, total: 2, data: [{ markdown: "page" }], next: path.startsWith("/v2") ? `http://127.0.0.1:${receiverPort}/cursor` : undefined } };
      } else reply = { code: 404, body: { error: "mock route not found" } };
    }
    res.writeHead(reply.code ?? 200, { "content-type": "application/json", ...reply.headers });
    res.end(JSON.stringify(reply.body ?? {}));
  } catch { res.writeHead(500); res.end('{"error":"mock failed"}'); }
});
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
process.env.CRW_API_URL = origin;
const configPath = process.env.FASTCRW_CONFIG!;
const writeConfig = (extra: Obj = {}) => writeFile(configPath, JSON.stringify({ apiUrl: origin, apiKey: key, ...extra }), { mode: 0o600 });
await writeConfig();
const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = await import("@earendil-works/pi-coding-agent");
const { validateToolArguments } = await import("@earendil-works/pi-ai");
const { Type } = await import("typebox");
const settingsManager = SettingsManager.inMemory({});
const loader = new DefaultResourceLoader({ cwd: home, agentDir: process.env.PI_CODING_AGENT_DIR!, settingsManager,
  noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  additionalExtensionPaths: [resolve("index.ts")],
  extensionFactories: [pi => pi.registerTool({ name: "offline_other", label: "Other", description: "Unrelated test tool", defaultActive: false,
    parameters: Type.Object({}), async execute() { return { content: [], details: {} }; } })] });
await loader.reload();
const names = ["search", "scrape", "map", "crawl", "batch", "extract", "changes", "parse", "research"].map(n => `fastcrw_${n}`);
const { session, extensionsResult } = await createAgentSession({ cwd: home, agentDir: process.env.PI_CODING_AGENT_DIR!, resourceLoader: loader, settingsManager, sessionManager: SessionManager.inMemory(), tools: [...names, "offline_other"] });
session.setActiveToolsByName(names);
await session.bindExtensions({ mode: "json" });
const toolMap = new Map(session.agent.state.tools.map(t => [t.name, t]));
const textOf = (r: Obj) => r.content.filter((c: Obj) => c.type === "text").map((c: Obj) => c.text).join("\n");
async function run(name: string, args: Obj, signal?: AbortSignal, updates?: Obj[]): Promise<Obj> {
  const tool = toolMap.get(`fastcrw_${name}`)!;
  const validated = validateToolArguments(tool, { id: "test", name: tool.name, type: "toolCall", arguments: args });
  const result = await tool.execute("test", validated as never, signal, r => updates?.push(r)) as Obj;
  if (result.details?.fullResponse) spillDirs.add(dirname(result.details.fullResponse));
  return result;
}
const last = () => hits.at(-1)!;
const command = session.extensionRunner.getCommand("fastcrw")!;
const notices: string[] = [];
async function cmd(args: string, hasUI = true, confirm = false) {
  const ctx = session.extensionRunner.createCommandContext();
  await command.handler(args, { ...ctx, hasUI, ui: { ...ctx.ui, confirm: async () => confirm, notify: text => { notices.push(text); } } });
}
const example = "https://page.example";
try {
  await test("offline SDK integration", async t => {
    await t.test("extension loads and all nine tools are active by default", () => {
      assert.deepEqual(extensionsResult.errors, []); assert.deepEqual(session.getActiveToolNames().sort(), [...names].sort());
    });
    for (const name of names) await t.test(`${name}: portable object schema`, () => {
      const schema = toolMap.get(name)!.parameters;
      assert.equal(schema.type, "object"); assert.doesNotMatch(JSON.stringify(schema), /"(anyOf|oneOf|const)"\s*:/);
    });
    await t.test("config: env URL/key outrank file, primary env outranks aliases", async () => {
      await writeConfig({ apiUrl: "https://should-not-be-used.invalid", apiKey: "file-only" });
      process.env.CRW_API_KEY = key; process.env.FASTCRW_API_KEY = "alias-only"; process.env.FASTCRW_API_URL = "https://should-not-be-used.invalid";
      await run("map", { url: example }); assert.equal(last().headers.authorization, `Bearer ${key}`); assert.equal(last().url, "/v1/map");
      delete process.env.CRW_API_KEY; delete process.env.FASTCRW_API_KEY; delete process.env.FASTCRW_API_URL; await writeConfig();
    });
    await t.test("config: aliases outrank file and file supplies fallback", async () => {
      delete process.env.CRW_API_URL; process.env.FASTCRW_API_URL = origin; process.env.FASTCRW_API_KEY = "alias-only";
      await run("map", { url: example }); assert.equal(last().headers.authorization, "Bearer alias-only");
      delete process.env.FASTCRW_API_URL; delete process.env.FASTCRW_API_KEY;
      await run("map", { url: example }); assert.equal(last().headers.authorization, `Bearer ${key}`); process.env.CRW_API_URL = origin;
    });
    await t.test("config: HTTP only on loopback; malformed URL rejected", async () => {
      for (const value of ["http://remote.invalid", "ftp://localhost", "https://user:pw@remote.invalid", "https://remote.invalid/?key=x", "bad-url"]) {
        process.env.CRW_API_URL = value; await assert.rejects(run("map", { url: example }), /HTTPS|Invalid fastCRW API URL/);
      }
      process.env.CRW_API_URL = origin; await run("map", { url: example });
    });
    await t.test("config: bad JSON, array and invalid disabledTools give safe actionable errors", async () => {
      for (const value of [`{\"apiKey\":\"${key}`, "[]", '{"disabledTools":42}']) {
        await writeFile(configPath, value);
        await assert.rejects(run("map", { url: example }), e => /Cannot read fastCRW config/.test(String(e)) && !String(e).includes(key));
      }
      await writeConfig();
    });
    await t.test("auth: only configured origin gets bearer; redirects are manual", async () => {
      responder = h => h.url === "/v1/map" ? { code: 302, headers: { location: `http://127.0.0.1:${receiverPort}/stolen` } } : undefined;
      await assert.rejects(run("map", { url: `http://127.0.0.1:${receiverPort}/target` }), /302/);
      assert.equal(last().headers.authorization, `Bearer ${key}`); assert.equal(redirected, 0); responder = undefined;
    });
    await t.test("redaction: engine and BYOK keys absent from text, details and spills", async () => {
      await writeConfig({ llm: { apiKey: llmKey } });
      responder = h => h.url === "/v1/scrape" ? { body: { data: { markdown: `${key} ${llmKey}`, metadata: { leaked: key }, arbitrary: llmKey } } } : undefined;
      const r = await run("scrape", { url: example });
      for (const value of [JSON.stringify(r), await readFile(r.details.fullResponse, "utf8")]) {
        assert.ok(!value.includes(key) && !value.includes(llmKey)); assert.match(value, /REDACTED/);
      }
      responder = h => h.url === "/v1/scrape" ? { code: 500, body: { error: `${key} ${llmKey}` } } : undefined;
      await assert.rejects(run("scrape", { url: example }), e => !String(e).includes(key) && !String(e).includes(llmKey) && /REDACTED/.test(String(e)));
      responder = undefined; await writeConfig();
    });
    await t.test("redaction: JSON-escaped credentials and job details/progress stay redacted", async () => {
      const escaped = 'quote"slash\\key';
      await writeConfig({ llm: { apiKey: escaped } });
      responder = h => h.url === "/v1/crawl" ? { body: { id: `${key}:${escaped}`, status: "processing" } } : undefined;
      const updates: Obj[] = [], r = await run("crawl", { action: "start", url: example, wait: false }, undefined, updates);
      for (const value of [JSON.stringify(r), JSON.stringify(updates), await readFile(r.details.fullResponse, "utf8")]) {
        assert.ok(!value.includes(key) && !value.includes(escaped) && !value.includes(JSON.stringify(escaped).slice(1, -1)));
        assert.match(value, /REDACTED/);
      }
      responder = undefined; await writeConfig();
    });
    await t.test("redaction: 401 has CRW_API_KEY hint; success:false surfaces warnings", async () => {
      responder = h => h.url === "/v1/map" ? { code: 401, body: { error: key } } : undefined;
      await assert.rejects(run("map", { url: example }), /401.*REDACTED.*CRW_API_KEY/);
      responder = h => h.url === "/v1/map" ? { body: { success: false, warnings: ["renderer unavailable"], error: "bad" } } : undefined;
      await assert.rejects(run("map", { url: example }), /warnings.*renderer unavailable/s); responder = undefined;
    });
    await t.test("search: answer injects empty scrapeOptions, sources and summaries map", async () => {
      const r = await run("search", { query: "test", answer: true, sources: ["web", "news"], summarizeResults: true });
      assert.deepEqual(last().body.scrapeOptions, {}); assert.deepEqual(last().body.sources, ["web", "news"]); assert.equal(last().body.summarizeResults, true);
      assert.equal(r.details.count, 3); assert.equal(r.details.answer, true); assert.match(textOf(r), /Answer:/); assert.doesNotMatch(textOf(r), /HIDDEN_MARKDOWN/);
    });
    await t.test("search: scrape explicitly includes markdown; advanced formats map", async () => {
      const r = await run("search", { query: "test", scrape: true, advanced: { scrapeFormats: ["markdown"], scrapeTimeout: 1000 } });
      assert.deepEqual(last().body.scrapeOptions, { formats: ["markdown"], timeout: 1000 }); assert.match(textOf(r), /HIDDEN_MARKDOWN/);
    });
    await t.test("search: flat results normalized without leaking unrequested markdown", async () => {
      responder = h => h.url === "/v1/search" ? { body: { data: [{ title: "Flat", snippet: "one", markdown: "hidden-flat" }] } } : undefined;
      const r = await run("search", { query: "flat" }); assert.equal(r.details.count, 1); assert.match(textOf(r), /Flat/); assert.doesNotMatch(textOf(r), /hidden-flat/); responder = undefined;
    });
    await t.test("search: missing requested summaries are partial errors", async () => {
      responder = h => h.url === "/v1/search" ? { body: { data: [{ title: "News" }] } } : undefined;
      const r = await run("search", { query: "news", summarizeResults: true }); assert.equal(r.isError, true); assert.match(textOf(r), /summary synthesis unavailable/); responder = undefined;
    });
    await t.test("scrape: data URL screenshot becomes raw-base64 image block", async () => {
      const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=";
      responder = h => h.url === "/v1/scrape" ? { body: { data: { screenshot: `data:image/png;base64,${png}` } } } : undefined;
      const r = await run("scrape", { url: example, formats: ["screenshot"] }); assert.ok(r.content.some((c: Obj) => c.type === "image" && c.data === png)); responder = undefined;
    });
    await t.test("scrape: query/topK defaults to sentence chunking", async () => {
      await run("scrape", { url: example, query: "test", topK: 2 }); assert.deepEqual(last().body.chunkStrategy, { type: "sentence" }); assert.equal(last().body.topK, 2);
    });
    await t.test("scrape: JSON and summary prompts use native fields", async () => {
      await run("scrape", { url: example, formats: ["json", "summary"], prompt: "title" });
      assert.deepEqual(last().body.extract, { prompt: "title" }); assert.equal(last().body.summaryPrompt, "title"); assert.equal(last().body.prompt, undefined);
    });
    await t.test("scrape: regex requires pattern and basis requires schema", async () => {
      await assert.rejects(run("scrape", { url: example, chunkStrategy: { type: "regex" } }), /requires pattern/);
      await assert.rejects(run("scrape", { url: example, advanced: { basis: true } }), /requires jsonSchema/);
    });
    await t.test("spill: truncation, readable path, private file/directory, and secret redaction", async () => {
      responder = h => h.url === "/v1/scrape" ? { body: { data: { markdown: `${key}\n` + "long content\n".repeat(6000) } } } : undefined;
      const r = await run("scrape", { url: example }); const path = r.details.fullResponse;
      assert.equal(r.details.truncated, true); assert.ok(textOf(r).includes(path)); assert.equal((await stat(path)).mode & 0o777, 0o600);
      assert.equal((await stat(dirname(path))).mode & 0o777, 0o700); assert.ok(!(await readFile(path, "utf8")).includes(key)); responder = undefined;
    });
    for (const kind of ["crawl", "batch", "extract"]) {
      const args = kind === "crawl" ? { url: example } : kind === "batch" ? { urls: [example] } : { urls: [example], prompt: "title" };
      await t.test(`${kind}: start+wait returns completed and cumulative updates`, async () => {
        const updates: Obj[] = []; jobStatus = "completed";
        const r = await run(kind, { action: "start", ...args }, undefined, updates);
        assert.equal(r.details.status, "completed"); assert.ok(r.details.jobId); assert.ok(updates.length >= 2);
        assert.equal(updates[0].details.status, "processing"); assert.equal(updates.at(-1)!.details.completed, 2);
      });
      await t.test(`${kind}: inline timeout returns jobId and leaves remote work running`, async () => {
        jobStatus = "processing"; const start = hits.length;
        const r = await run(kind, { action: "start", ...args, waitSeconds: 1 });
        assert.ok(r.details.jobId); assert.match(textOf(r), /timed out.*remote work continues/); assert.ok(!hits.slice(start).some(h => h.method === "DELETE"));
      });
      await t.test(`${kind}: abort during wait sends independent DELETE and rejects`, async () => {
        jobStatus = "processing"; const ac = new AbortController(), start = hits.length;
        const timer = setTimeout(() => ac.abort(), 75);
        try { await assert.rejects(run(kind, { action: "start", ...args }, ac.signal), /Operation aborted; cancellation attempted/); }
        finally { clearTimeout(timer); }
        assert.equal(hits.slice(start).filter(h => h.method === "DELETE").length, 1);
      });
      await t.test(`${kind}: terminal cancel no-op; control calls ignore start-only params`, async () => {
        jobStatus = "completed"; const start = hits.length;
        const r = await run(kind, { action: "cancel", jobId: "finished", ...args, ...(kind === "crawl" ? { url: "not a URL" } : {}) });
        assert.match(textOf(r), /already finished/);
        await run(kind, { action: "status", jobId: "finished", ...args });
        assert.ok(hits.slice(start).every(h => h.method !== "POST" && h.text === ""));
      });
      await t.test(`${kind}: no-wait returns accepted job immediately`, async () => {
        jobStatus = "processing"; const updates: Obj[] = [], start = hits.length;
        const r = await run(kind, { action: "start", ...args, wait: false }, undefined, updates);
        assert.ok(r.details.jobId); assert.equal(updates.length, 1); assert.equal(hits.slice(start).filter(h => h.method === "GET").length, 0);
      });
    }
    jobStatus = "completed";
    for (const kind of ["crawl", "batch"]) await t.test(`${kind}: v2 bounded paging and errors routes; no cursor following`, async () => {
      const r = await run(kind, { action: "status", jobId: "a/b", skip: 2, limit: 1 });
      assert.equal(last().url, `/v2/${kind === "batch" ? "batch/scrape" : kind}/a%2Fb?skip=2&limit=1`); assert.equal(r.details.nextSkip, 3);
      await run(kind, { action: "errors", jobId: "a/b" }); assert.match(last().url, /\/v2\/.*\/a%2Fb\/errors$/); assert.equal(redirected, 0);
    });
    await t.test("crawl: active route", async () => { await run("crawl", { action: "active" }); assert.equal(last().url, "/v2/crawl/active"); });
    await t.test("changes: first observation, same, changed, secure baseline and previous mapping", async () => {
      const first = await run("changes", { mode: "url", url: example, tag: "test" }); assert.equal(first.details.firstObservation, true);
      const same = await run("changes", { mode: "url", url: example, tag: "test" }); assert.equal(same.details.status, "same"); assert.equal(same.details.firstObservation, false);
      assert.equal(last().body.changeTracking.previous.contentHash, "old"); trackingVersion = "new";
      const changed = await run("changes", { mode: "url", url: example, tag: "test" }); assert.equal(changed.details.status, "changed");
      const dir = join(process.env.FASTCRW_HOME!, "snapshots"), files = await readdir(dir); assert.equal(files.length, 1);
      assert.equal((await stat(dir)).mode & 0o777, 0o700); assert.equal((await stat(join(dir, files[0]))).mode & 0o777, 0o600);
    });
    await t.test("changes: list metadata only, forget one and forget all", async () => {
      const r = await run("changes", { mode: "list" }); assert.equal(r.details.count, 1); assert.doesNotMatch(await readFile(r.details.fullResponse, "utf8"), /contentHash/);
      assert.equal((await run("changes", { mode: "forget", url: example, tag: "test" })).details.count, 1);
      await run("changes", { mode: "url", url: example, tag: "one" }); await run("changes", { mode: "url", url: example, tag: "two" });
      assert.equal((await run("changes", { mode: "forget", all: true })).details.count, 2); assert.equal((await run("changes", { mode: "list" })).details.count, 0);
    });
    await t.test("changes: deterministic diff maps supplied snapshots", async () => {
      const r = await run("changes", { mode: "diff", previous: { markdown: "old" }, current: { markdown: "new" } });
      assert.equal(last().url, "/v1/change-tracking/diff"); assert.deepEqual(last().body.current, { markdown: "new" }); assert.equal(r.details.status, "changed");
    });
    await t.test("parse: real multipart PDF bytes and native options; pages details", async () => {
      const path = join(home, "tiny.pdf"); await writeFile(path, "%PDF-1.4\ntest\n%%EOF");
      const r = await run("parse", { path, formats: ["markdown"], parsers: [{ type: "pdf", mode: "fast" }] });
      assert.match(String(last().headers["content-type"]), /multipart\/form-data; boundary=/);
      assert.match(last().text, /name="file"; filename="tiny.pdf"/); assert.match(last().text, /Content-Type: application\/pdf/i);
      assert.match(last().text, /%PDF-1.4/); assert.match(last().text, /name="options"/); assert.match(last().text, /"formats":\["markdown"\]/); assert.equal(r.details.pages, 1);
    });
    await t.test("parse: non-PDF and size cap rejected before upload", async () => {
      const path = join(home, "bad.pdf"); await writeFile(path, "not pdf");
      await assert.rejects(run("parse", { path }), /expects a PDF/);
      await truncate(path, 4097); await assert.rejects(run("parse", { path }), /4096 byte upload cap/);
    });
    for (const action of ["papers", "paper", "similar", "github"]) await t.test(`research: ${action} route and k clamping`, async () => {
      const args = action === "paper" ? { id: "arxiv:1/2", query: "passage" } : action === "similar" ? { id: "arxiv:1/2", intent: "relevant", mode: "references" } : { query: "test" };
      const r = await run("research", { action, ...args, k: 999 });
      const url = new URL(last().url, origin); assert.equal(url.searchParams.get("k"), action === "paper" ? "20" : "100");
      assert.equal(url.pathname, `/v1/search/research/${action === "github" ? "github" : "papers"}${["paper", "similar"].includes(action) ? "/arxiv%3A1%2F2" : ""}${action === "similar" ? "/similar" : ""}`);
      assert.equal(r.details.effectiveK, action === "paper" ? 20 : 100);
    });
    await t.test("research: negative k fails model argument validation", async () => { await assert.rejects(run("research", { action: "github", query: "test", k: -1 }), /Validation failed/); });
    await t.test("BYOK/proxy: config-only, per-tool flattening; extract never gets baseUrl", async () => {
      await writeConfig({ llm: { apiKey: llmKey, provider: "openai-compatible", model: "test", baseUrl: "https://llm.example/v1" }, proxy: { proxy: "http://u:p@proxy.example", proxyRotation: "random", country: "us" } });
      for (const kind of ["search", "scrape", "batch", "extract", "crawl", "map"]) {
        const args = kind === "search" ? { query: "test" } : kind === "scrape" || kind === "map" ? { url: example } : kind === "crawl" ? { action: "start", url: example, wait: false } : { action: "start", urls: [example], prompt: kind === "extract" ? "title" : undefined, wait: false };
        await run(kind, args); const b = last().body;
        const byok = ["search", "scrape", "batch", "extract"].includes(kind);
        assert.equal(b.llmApiKey, byok ? llmKey : undefined); assert.equal(b.llmProvider, byok ? "openai-compatible" : undefined); assert.equal(b.llmModel, byok ? "test" : undefined);
        assert.equal(b.baseUrl, byok && kind !== "extract" ? "https://llm.example/v1" : undefined);
        if (kind === "crawl") { assert.deepEqual(b.proxyList, ["http://u:p@proxy.example"]); assert.equal(b.proxy, undefined); }
        else assert.equal(b.proxy, ["scrape", "batch"].includes(kind) ? "http://u:p@proxy.example" : undefined);
      }
      await run("scrape", { url: example, advanced: { country: "gb" } }); assert.equal(last().body.country, "gb"); await writeConfig();
    });
    await t.test("capabilities: actionable server limits and renderer gates", async () => {
      await assert.rejects(run("search", { query: "test", limit: 3 }), /searchMaxLimit=2.*reduce limit/);
      await assert.rejects(run("batch", { action: "start", urls: [example, example, example] }), /1\.\.2 urls/);
      await assert.rejects(run("extract", { action: "start", urls: [example, example, example], prompt: "x" }), /1\.\.2 urls/);
      await assert.rejects(run("scrape", { url: example, advanced: { renderer: "chrome" } }), /unavailable.*Use auto/);
    });
    await t.test("capabilities: fetch failure does not deny calls", async () => {
      process.env.CRW_API_URL = origin + "/fallback";
      responder = h => h.url.endsWith("/capabilities") ? { code: 503, body: { error: "offline" } } : undefined;
      const r = await run("search", { query: "test", limit: 3 }); assert.equal(r.details.count, 3); assert.equal(last().body.limit, 3);
      responder = undefined; process.env.CRW_API_URL = origin;
    });
    await t.test("admin: reset refuses no UI and decline does not send request", async () => {
      const start = hits.length;
      await cmd("reset breakers", false); await cmd("reset preferences example.com", true, false);
      assert.ok(!hits.slice(start).some(h => h.url.startsWith("/admin/")));
      assert.ok(session.messages.some(m => JSON.stringify(m).includes("interactive confirmation UI")));
    });
    await t.test("tools: list reports activation and approximate schema token costs", async () => {
      await cmd("tools list"); const text = notices.at(-1)!;
      for (const name of names) assert.ok(text.includes(`${name}: active`)); assert.match(text, /~\d+ schema tokens/);
    });
    await t.test("tools: toggle preserves config keys, writes atomically at 0600 and leaves unrelated tools alone", async () => {
      await writeConfig({ custom: { preserved: true } });
      session.setActiveToolsByName([...names, "offline_other"]);
      await cmd("tools disable search"); assert.ok(session.getActiveToolNames().includes("offline_other")); assert.ok(!session.getActiveToolNames().includes("fastcrw_search")); assert.ok(session.getActiveToolNames().includes("fastcrw_map"));
      const file = JSON.parse(await readFile(configPath, "utf8")); assert.deepEqual(file.custom, { preserved: true }); assert.equal(file.apiKey, key);
      assert.deepEqual(file.disabledTools, ["fastcrw_search"]); assert.equal((await stat(configPath)).mode & 0o777, 0o600);
      assert.ok(!(await readdir(home)).some(n => n.endsWith(".tmp"))); await cmd("tools enable fastcrw_search"); assert.ok(session.getActiveToolNames().includes("fastcrw_search"));
    });
    await t.test("tools: persisted disabled set applies on session_start, all enable/disable and completions", async () => {
      await writeConfig({ disabledTools: ["fastcrw_map"] }); await session.extensionRunner.emit({ type: "session_start", reason: "reload" });
      assert.ok(!session.getActiveToolNames().includes("fastcrw_map")); await cmd("tools disable all"); assert.deepEqual(session.getActiveToolNames(), ["offline_other"]);
      assert.ok(session.getActiveToolNames().includes("offline_other"));
      await cmd("tools enable all"); assert.equal(session.getActiveToolNames().length, 10);
      session.setActiveToolsByName(names);
      const completions = await command.getArgumentCompletions!("tools disable fastcrw_s"); assert.ok(completions?.some(c => c.value === "tools disable fastcrw_search"));
    });
    await t.test("tools: invalid commands do not modify config or active set", async () => {
      const before = await readFile(configPath, "utf8"), active = session.getActiveToolNames();
      await cmd("tools disable unknown"); assert.equal(await readFile(configPath, "utf8"), before); assert.deepEqual(session.getActiveToolNames(), active);
    });
    const theme = { fg: (_color: unknown, text: string) => text };
    for (const name of names) await t.test(`${name}: compact renderers tolerate partial args/missing details and escape controls`, () => {
      const tool = session.getToolDefinition(name)!;
      const ctx = {} as never;
      for (const args of [{}, { query: "evil\x1b]52;c;abc\x07\rtext" }]) {
        const call = tool.renderCall!(args as never, theme as never, ctx).render(80).join("\n"); assert.doesNotMatch(call, /[\x00-\x08\x0b-\x1f\x7f-\x9f]/);
      }
      for (const expanded of [true, false]) for (const isPartial of [true, false]) {
        const r = { content: [{ type: "text" as const, text: "progress\x1b[2J\n".repeat(150) }], details: undefined };
        const lines = tool.renderResult!(r, { expanded, isPartial }, theme as never, ctx).render(160);
        assert.ok(lines.length <= 83); assert.doesNotMatch(lines.join("\n"), /[\x00-\x08\x0b-\x1f\x7f-\x9f]/);
        if (!expanded || isPartial) assert.equal(lines.length, 1);
        if (isPartial) assert.match(lines[0], /progress/);
      }
    });
    await t.test("renderers: collapsed summaries cover counts, answers, bytes, images, job progress and changes", () => {
      const fixtures: Array<[string, Obj, string]> = [
        ["search", { count: 3, answer: true }, "3 results · answer"], ["map", { count: 2 }, "2 urls"],
        ["scrape", { bytes: 123, truncated: true }, "123 bytes · truncated · image"],
        ["crawl", { jobId: "job-1", status: "completed", completed: 2, total: 3 }, "completed 2/3 · job-1"],
        ["changes", { status: "changed" }, "changed"], ["parse", { pages: 1, bytes: 456 }, "1 pages · 456 bytes"],
        ["research", { count: 4 }, "4 results"],
      ];
      for (const [name, details, expected] of fixtures) {
        const tool = session.getToolDefinition(`fastcrw_${name}`)!;
        const r = { content: [{ type: "image" as const, data: "", mimeType: "image/png" }], details };
        assert.equal(tool.renderResult!(r, { expanded: false, isPartial: false }, theme as never, {} as never).render(160).join("").trimEnd(), expected);
      }
    });
    await t.test("all engine requests carried auth, and no cross-origin receiver was contacted", () => {
      assert.ok(hits.every(h => /^Bearer /.test(String(h.headers.authorization)))); assert.equal(redirected, 0);
    });
  });
} finally {
  session.dispose(); globalThis.fetch = originalFetch;
  server.closeAllConnections(); receiver.closeAllConnections();
  await Promise.all([new Promise<void>(r => server.close(() => r())), new Promise<void>(r => receiver.close(() => r()))]);
  for (const path of spillDirs) await rm(path, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
  for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k];
  Object.assign(process.env, originalEnv);
}
