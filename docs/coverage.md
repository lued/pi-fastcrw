# Coverage

MCP coexistence and the feature-by-feature matrix against fastCRW.

## Coexisting with the `crw` MCP server

Native tools overlap with the engine's MCP tools. If both are configured, remove/disable the MCP server or hide its exposure in `~/.pi/agent/mcp.json` to avoid ambiguous duplicate capabilities:

```json
{ "mcpServers": { "crw": { "exposure": "hidden" } } }
```

## Feature coverage vs fastCRW

v1.1 status: **✅** implemented, **config** user-config-only setting or conditional tool, **—** deliberately unavailable/out of scope.

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
| Query-ranked chunks, sentence/regex/topic strategies | ✅ | `query`, `topK`, `chunkStrategy`, `filterMode`; `query` defaults to sentence chunking and `bm25` ranking (the engine does not rank by query otherwise) |
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
| Hosted scheduled monitors, checks, webhook/email config, balance | config | `fastcrw_monitor`, registered only with `monitor.apiKey`; offline-tested, **not verified against the live hosted API** |
| Compatibility aliases, MCP transport, crw-browse/CDP | — | REST-native extension; no duplicate transports |
