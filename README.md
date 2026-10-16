# pi-fastcrw

Nine native [pi](https://pi.dev) tools for a self-hosted fastCRW / `crw` web engine (REST API, v0.37.x). **v0.2** covers search, scrape, map, crawl, batch, extract, changes, local PDF parsing, and research, in a single extension file: `index.ts`.

## Install

```bash
pi install npm:pi-fastcrw       # from npm
pi install ./path/to/pi-fastcrw # local checkout
pi -e ./index.ts               # try without installing
```

## Configuration

User-only file: `~/.pi/agent/fastcrw.json`. Project files cannot choose an engine or credential target.

```json
{
  "apiUrl": "https://search.example.com",
  "apiKey": "your-engine-token",
  "llm": {
    "apiKey": "your-provider-key",
    "provider": "openai-compatible",
    "model": "your-model",
    "baseUrl": "https://llm.example.com/v1"
  },
  "proxy": {
    "proxy": "http://user:password@proxy.example.com:8080",
    "proxyList": [],
    "proxyRotation": "sticky_per_host",
    "country": "us"
  }
}
```

Only `apiUrl`/`apiKey` are needed for an authenticated engine with its own LLM. Omit `llm` and `proxy` unless you want overrides. Restrict this file to your user:

```bash
chmod 600 ~/.pi/agent/fastcrw.json
```

Environment variables override engine settings:

- `CRW_API_URL` (alias `FASTCRW_API_URL`): default `http://localhost:3000`. HTTPS required except loopback; URL credentials/query/fragment rejected.
- `CRW_API_KEY` (alias `FASTCRW_API_KEY`): optional bearer token for engine authentication.

`llm` is flattened to `llmApiKey`/`llmProvider`/`llmModel`/`baseUrl` for search, scrape, and batch. Extract receives the first three, **never `baseUrl`**. Provider/model/base URL overrides require `llm.apiKey`. Crawl JSON and PDF-upload JSON/summary use the **server's** LLM, not BYOK. LLM credentials are config-only, not tool parameters.

`proxy` applies to scrape, batch, and crawl. A call's `advanced.country` overrides configured country. Crawl accepts a proxy pool; a configured single `proxy` becomes a one-entry `proxyList` when no pool is configured. Rotation choices: `round_robin`, `random`, `sticky_per_host`. Proxy URLs/credentials are config-only. `country` is an egress hint, **not** search-result geography.

The engine token is sent only to the configured origin; redirects and returned job cursors cannot send it elsewhere. Known engine/LLM keys, proxy URLs/userinfo, and sensitive target-header values are redacted from responses/errors/spills. Credentials are never written to snapshot metadata.

## Tools

All nine tools are direct and active by default. Common intent-level fields are top-level; uncommon knobs live in one optional, closed `advanced` object. Only explicit allowlisted fields are flattened onto native request bodies.

| Name | What it does | Engine route |
| --- | --- | --- |
| `fastcrw_search` | Web/news/images, category hints, scraped evidence, summaries, cited answers. | `POST /v1/search` |
| `fastcrw_scrape` | Read one URL, screenshot, JSON/summary, relevant chunks, cache and tracked changes. | `POST /v1/scrape` |
| `fastcrw_map` | Discover URLs, then optionally filter the returned list. | `POST /v1/map` |
| `fastcrw_crawl` | `start \| status \| cancel \| errors \| active`; bounded site discovery and progress. | `/v1/crawl`, v2 status/errors/active |
| `fastcrw_batch` | `start \| status \| cancel \| errors`; known URLs with a shared scrape template. | `/v1/batch/scrape`, v2 status/errors |
| `fastcrw_extract` | `start \| status \| cancel`; structured fields with optional source evidence. | `/v1/extract` |
| `fastcrw_changes` | `mode: url \| diff \| list \| forget`; saved URL baselines or supplied-content diffs. | scrape + `/v1/change-tracking/diff`; local store |
| `fastcrw_parse` | Upload an explicitly selected local PDF as binary multipart. | `POST /v2/parse` |
| `fastcrw_research` | `papers \| paper \| similar \| github`; scholarly retrieval and README hits. | `GET /v1/search/research/*` |

### Parameters and important semantics

- **Search:** `query`, `limit` (1–20, default 5), `sources`, `categories` (≤5), `lang`, `tbs`, `scrape`, `answer`, `summarizeResults`. `advanced` contains answer/summary budgets, prompts, temperature and strategy flags, plus `scrapeFormats`, `scrapeOnlyMainContent`, `scrapeCountry`, `scrapeTimeout` (ms). Answer/summaries automatically inject `scrapeOptions:{}`; scraped markdown/HTML is shown only when explicitly requested. Flat and grouped source responses are normalized. Image-search results are links, not image downloads. The engine summarizes only web results; `summarizeResults` on news returns none (reported as an error).
- **Scrape:** `url`, `formats`, `onlyMainContent`, `renderJs`, `waitFor` (ms), selectors/tags, `jsonSchema`, `prompt`, `headers`; `query`, `topK`, `chunkStrategy`, `filterMode`; `maxAge` (ms, 0 fresh), `storeInCache`. Query mode shows compact relevant chunks rather than duplicating the entire document. `advanced`: renderer pin, country, stealth, full-page screenshot, object-only PDF `parsers`, `basis`, `deadlineMs`, `maxContentChars`, `changeTracking`, `goal`, `judgeEnabled`. JSON needs schema or prompt; `basis` needs schema. Summary prompt ≤500 chars. Regex chunking needs `pattern`; overlap must be smaller than chunk size. `storeInCache:false` still permits cache reads.
- **Map:** `search`, `includePaths`, `excludePaths` are **local case-insensitive substring post-filters**, not regexes or discovery policies. They run after the native discovery cap; exclusion wins. `crawlFallback` supplements sitemap discovery. `advanced` holds native URL-parameter filtering and `timeout` in **seconds**; values above 280 are clamped with a warning to fit the 290-second HTTP budget.
- **Jobs:** start waits by default, reports cumulative progress, and returns `jobId`. `wait:false` returns immediately; `waitSeconds` (1–290, default 120) expiring leaves the remote job running. Explicit user abort after acceptance attempts DELETE with a separate timeout. Status inspection does not cancel unrelated jobs. Finished-job cancellation is a successful no-op. Jobs are process-local on the engine and may expire or disappear after restart.
- **Crawl:** defaults `maxPages:10`, `maxDepth:2`; supports `jsonSchema`, `renderJs`, `waitFor`, target `headers`, and `advanced.renderer/country`. Native crawl has **no include/exclude-path policy**; use map filters and batch for a selected URL set.
- **Batch:** `urls`, `ignoreInvalidUrls` (default true), `maxConcurrency`, and the scrape template, including ranking/chunking and the same `advanced` knobs. Native invalid-URL handling is preserved.
- **Paging:** crawl/batch status accepts `skip`/`limit` (≤100). Explicit paging or a large native response selects `/v2`. Each observation returns one bounded page and, when available, `details.nextSkip` plus a resume instruction. V2 may omit native `plainText`, chunks, or basis; use single-page scrape when these are essential. Inspect `/errors` separately. No automatic cursor URL is followed.
- **Extract:** 1–50 `urls` (or a smaller advertised server cap), `prompt` and/or `schema`; `basis:true` requires `schema`. Results retain ordered slots, including errors. No endpoint override is sent.
- **Changes:** URL mode and inline scrape tracking share `~/.pi/agent/fastcrw/snapshots/`, keyed by SHA-256 of normalized URL + tag. Files are 0600, directory 0700; writes use a same-directory private temp file plus atomic rename under an exclusive per-key lock. First observation establishes a baseline; identical repeat reports `same`. Explicit `previous` wins over the saved snapshot. Modes/schema changes require a new tag or forgetting the baseline. List returns metadata only. Forget one with `url` + optional `tag`, or explicitly use `all:true`. Snapshots are shared across projects; use unique tags for different extraction configurations. Remove a stale `.lock` only after checking no writer is active. `diff` accepts `current`/`previous` or a `batch` of inline snapshots and never fetches or invokes an LLM. Judging requires URL mode plus `goal` and `judgeEnabled:true`; it is not automatically enabled by a goal.
- **Parse:** `path` resolves relative to pi's cwd or may be absolute; only regular PDFs with a `%PDF-` signature are uploaded. Size cap is min(50 MiB, server cap), including multipart overhead. `formats`, object-only `parsers`, `jsonSchema`, `summaryPrompt`, `maxContentChars` are native options. The server may return `422 pdf_parse_failed` if its sandbox is broken; scanned-page OCR is not guaranteed. This uploads the selected local file—do not select unrelated private files.
- **Research:** `query`, `id`, `intent`, `mode`, `k`, and papers-only author/category/date filters. IDs are encoded as one path segment. `k` is clamped to 1–100, or 1–20 for paper passages. Paper passages are **abstract sentences, not full-paper text**. Similar-paper `intent` is required but is not used for reranking by this engine. GitHub results are repository/README hits, not issues or PRs.

Capabilities are fetched lazily and cached for ten minutes. Preflight checks cover search/batch/extract limits and renderer availability, and warn about missing LLM keys. If capability discovery fails, ordinary calls proceed without gates; the engine remains authoritative.

## `/fastcrw` command

Argument completion is available for these subcommands:

| Command | Behavior |
| --- | --- |
| `/fastcrw` or `/fastcrw status` | Resolved URL, key presence (never its value), `/health`, `/ready`, refreshed capability version and LLM summary. |
| `/fastcrw snapshots` | List saved baseline metadata. |
| `/fastcrw metrics` | Summarize `/metrics/renderer-breakers` and `/metrics/renderer-preferences`; full responses spill privately. |
| `/fastcrw reset breakers` | POST `/admin/breakers/reset`, **only after UI confirmation**. |
| `/fastcrw reset preferences [host]` | POST `/admin/preferences/reset` for one host or all, **only after UI confirmation**. |

Resets are refused without a confirmation-capable UI. There are no model-callable admin reset tools. Status/command output is also emitted in non-UI modes.

## Output and safety

- Text is bounded to pi's 2000-line / 50-KB limits, with room reserved for a spill notice and closing untrusted delimiter.
- Complete redacted JSON responses are saved to private 0600 files in a 0700 `pi-fastcrw-*` temp directory, including filtered-out map links. `details.fullResponse` and the text show a readable path. Screenshot PNGs also have a readable path and are attached as images.
- Spills are retained for later `read`; clean them up when no longer needed. Snapshot baselines persist separately until forgotten. Both may contain sensitive page/document content; permissions are not encryption.
- Fetched page, paper, README, answer and diff text is wrapped in `<untrusted-web-content>` tags. Treat it as evidence, not instructions.
- Target-page `headers` may reach browser subresources. Never pass engine credentials in them. Proxies and BYOK settings belong in user config, not tool arguments or prompts.

## Coexisting with the `crw` MCP server

Native tools overlap with the engine's MCP tools. If both are configured, remove/disable the MCP server or hide its exposure in `~/.pi/agent/mcp.json` to avoid ambiguous duplicate capabilities:

```json
{ "mcpServers": { "crw": { "exposure": "hidden" } } }
```

## Feature coverage vs fastCRW

v0.2 status: **✅** implemented, **config** user-config-only setting, **—** deliberately unavailable/out of scope.

| fastCRW feature | pi-fastcrw | Notes |
| --- | --- | --- |
| Web/news/image search, categories, recency/language | ✅ | `fastcrw_search`; flat/grouped normalization |
| Search scraped evidence, summaries, cited answers | ✅ | Native enrichment formats; auto-injected scrape options |
| Answer prompts/budgets/temperature/query expansion/multi-round strategy | ✅ | `search.advanced` |
| Scrape markdown/html/rawHtml/plainText/links/images | ✅ | Native formats |
| Screenshot + full-page option | ✅ | PNG image block and readable path |
| JSON/summary and field-level evidence (`basis`) | ✅ | Schema/prompt validation; server or configured LLM |
| CSS/XPath/tag targeting, JS/wait, target headers | ✅ | Headers carry cross-origin subresource risk |
| Renderer pinning, country, stealth, deadline | ✅ | `advanced`; available renderer preflight |
| Query-ranked chunks, sentence/regex/topic strategies | ✅ | `query`, `topK`, `chunkStrategy`, `filterMode` |
| Cache age and writes | ✅ | `maxAge`, `storeInCache` |
| PDF parser objects and page caps | ✅ | `advanced.parsers`; no guaranteed OCR |
| BYOK LLM provider/model/key/base URL | config | Search/scrape/batch; extract never receives base URL |
| Proxies and rotation | config | Scrape/batch/crawl; per-call country override |
| Debug traces, browser actions, internal engine flags | — | Not exposed; actions rejected by native engine |
| Map discovery, sitemap and BFS fallback | ✅ | Native v1 |
| Map search/include/exclude filters | ✅ | Local substring post-filters, not discovery policies |
| Map timeout and query-parameter policies | ✅ | `advanced`; seconds and explicit clamp warning |
| Crawl bounded start/status/cancel | ✅ | Inline wait, progress, abort cleanup |
| Crawl JSON/render/wait/headers/renderer/country | ✅ | Native supported subset; no path-policy fields |
| Crawl/batch paged status, errors; active crawls | ✅ | Fixed-origin v2 paging with skip/limit |
| Batch scrape + full shared scrape template | ✅ | `fastcrw_batch`; URL count preflight |
| Multi-URL extract, ordered slots, evidence | ✅ | `fastcrw_extract`; schema required for basis |
| URL change tracking + private persistent snapshots | ✅ | Shared by scrape and `fastcrw_changes` |
| Deterministic single/batch inline snapshot diff | ✅ | No fetch or LLM |
| Meaningful-change judge | ✅ | Explicit URL tracking opt-in with goal |
| Local PDF multipart upload | ✅ | `fastcrw_parse`; server sandbox prerequisite |
| Paper search/metadata/abstract passages/related graph/GitHub README | ✅ | `fastcrw_research`; no full-paper passage claim |
| Health/readiness/capabilities | ✅ | `/fastcrw status`; lazy 10-minute cache for tools |
| Renderer metrics and admin resets | ✅ | Commands only; resets require UI confirmation |
| Hosted scheduled monitors/billing/webhook delivery | — | Hosted control plane, not the self-host engine |
| Compatibility aliases, MCP transport, crw-browse/CDP | — | REST-native extension; no duplicate transports |

## Testing

```bash
npm install
npm run check   # strict type-check
npm run smoke   # sequential live checks, uses your user config
```

Smoke tests exercise all nine schemas (no `anyOf`/`oneOf`/`const`), source/category/summarize search, scrape chunking/cache/rendering/evidence, map filters, crawl paging/errors/active, two-URL batch start/status/errors/cancel, schema+basis extraction, persistent changes/list/forget and stateless single/batch diff, a generated local PDF, and all four research actions. Snapshot tests use a unique tag, verify permissions, and forget it in `finally`. Page requests use only example.com, en.wikipedia.org, and pi.dev, with small limits. **No live admin resets.**

`smoke` prints `PASS`, `FAIL` (unexpected result/extension bug), or `SERVER` (HTTP 503/504, `search_degraded`, unavailable engine synthesis, or HTTP 422 `pdf_parse_failed`). Search outages/incomplete synthesis are retried once after 20 seconds; SERVER lines do not count as failures. Successful PDF parsing requires the generated text to be returned, not just an HTTP-200 envelope. Missing requested result summaries are reported as partial errors rather than silently passing.

v0.2 verification on the configured engine: **63 passed, 0 failed, 1 server-side error**. News search returned grouped results but no summaries (`llmUsage.executedSummaries:0`) despite native `summarizeResults:true` and `scrapeOptions:{}`, including after retry. The generated PDF parsed successfully (the sandbox failure recorded during planning was not reproduced). Additional local-mock verification covered 32 checks for config/BYOK/proxy mapping, redaction, capability limits/fallback, paging, snapshots, multipart upload, abort cancellation, and command confirmation guards. No admin resets were sent to the live engine.

Manual checks inside pi:

| Feature | Try this prompt |
| --- | --- |
| status/metrics | Type `/fastcrw status`, then `/fastcrw metrics`. |
| search | “Search for pi coding agent, 2 results, with a cited answer.” |
| chunks | “Scrape https://en.wikipedia.org/wiki/Web_crawler with query 'politeness', topK 2, sentence chunking.” |
| screenshot | “Take a full-page screenshot of https://example.com.” |
| map | “Map https://pi.dev and include only URLs containing docs.” |
| crawl/progress | “Crawl https://example.com, maxPages 2; show progress and errors.” |
| abort | Start a crawl, press Esc; check that cancellation was attempted. |
| batch | “Batch scrape https://example.com and https://pi.dev; wait, then inspect status with skip 0, limit 1, and get errors.” |
| extraction | “Extract the title from https://example.com with a title schema and basis:true.” |
| changes | “Track https://example.com under tag manual-demo twice; expect first observation then same. List snapshots and forget that tag.” |
| inline diff | “Diff markdown 'old title' against 'new title' with fastcrw_changes; do not fetch a URL.” |
| parse | “Use fastcrw_parse on ./document.pdf as markdown.” Only use a PDF you authorize uploading. |
| research | “Find one paper on attention, inspect its abstract passages, get one reference, and one matching GitHub README.” |
| truncation | “Scrape https://en.wikipedia.org/wiki/List_of_programming_languages as rawHtml”; read the full spill path. |
| admin safety | Manually enter `/fastcrw reset preferences example.com` and decline confirmation; nothing should reset. |

## Development

Implementation stays in `index.ts`; tests in `smoke.mts`. No build step is needed: pi loads TypeScript directly.

## License

MIT
