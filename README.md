# pi-fastcrw

Native [pi](https://pi.dev) tools for a [fastCRW](https://fastcrw.com) (`crw`) engine: search, scrape, map, crawl, batch, extract, change tracking, PDF parsing and research, plus an optional hosted-monitor tool. One TypeScript extension, `index.ts` — no build step, no MCP server, no second service.

![A pi session using fastcrw_search and fastcrw_scrape; results stay collapsed until expanded](https://raw.githubusercontent.com/lued/pi-fastcrw/main/docs/images/session.png)

```bash
pi install git:github.com/lued/pi-fastcrw@v1.1.0   # pinned release
```

| | |
| --- | --- |
| Requires | pi **1.3.0+**, Node **22.19+**, and a running fastCRW engine (REST API **v0.37.x**) with the token it accepts |
| Config | `~/.pi/agent/fastcrw.json`, mode `0600` — one user-scoped file |
| Network | only the engine you configure; the hosted control plane only if you enable `fastcrw_monitor`. No telemetry |
| License | MIT |

The nine engine tools work against any fastCRW engine. `fastcrw_monitor` is different: it exists only on the hosted control plane (`https://fastcrw.com/api`) and is registered only when you configure a monitor key. It is tested against a mock control plane and is **not verified against the live hosted API**.

## Install

```bash
pi install git:github.com/lued/pi-fastcrw@v1.1.0   # pinned tag
pi install git:github.com/lued/pi-fastcrw@<sha>    # pinned commit
pi install ./path/to/pi-fastcrw                    # local checkout or tarball, no copy
pi -e ./index.ts                                   # try once without installing
```

Restart pi after installing, or run `/reload`: extension code is loaded at process start. `pi list` then shows the package, `pi remove <source>` removes it, and `pi update --extensions` reconciles it.

No npm release exists yet, so `pi install npm:pi-fastcrw` resolves only after the first `npm publish`; the pinned git tag above is what installs today. Tested pi, Node and engine versions: [Compatibility](https://github.com/lued/pi-fastcrw/blob/main/docs/compatibility.md).

## Quick start

1. Point the extension at your engine and restrict the file:

   ```bash
   cat > ~/.pi/agent/fastcrw.json <<'EOF'
   { "apiUrl": "https://search.example.com", "apiKey": "your-engine-token" }
   EOF
   chmod 600 ~/.pi/agent/fastcrw.json
   ```

2. Start pi, run `/fastcrw status`, and check the resolved URL, `/health`, `/ready` and the engine's capabilities.
3. Ask: *Use fastcrw_search to find two pages about web crawlers.*

```typescript
fastcrw_search({ query: "fastCRW engine", limit: 2, answer: true })
fastcrw_scrape({ url: "https://pi.dev", query: "packages", topK: 3 })
fastcrw_map({ url: "https://pi.dev", includePaths: ["docs"] })
```

An engine with its own LLM needs no further configuration; `llm` and `proxy` blocks are overrides only. With no config at all the tools still register against `http://localhost:3000` without a key, and capability errors name the setting to add.

## Tools

The nine engine tools are direct and active by default; `fastcrw_monitor` is direct and active only when a monitor key is configured, and otherwise does not exist. Common intent-level fields are top-level, uncommon knobs live in one optional, closed `advanced` object, and only explicit allowlisted fields are flattened onto native request bodies.

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
| `fastcrw_monitor` | Hosted only, conditional: `create \| list \| get \| update \| delete \| run \| checks \| check \| balance`. | control plane `/v1/monitor*`, `/v1/account/balance` |

Per-tool parameters and semantics — paging, job lifetimes, chunking defaults, map filters, redaction — are in [Tools](https://github.com/lued/pi-fastcrw/blob/main/docs/tools.md).

## Configuration

Only `apiUrl` and `apiKey` are needed. Everything else is an override:

```json
{
  "apiUrl": "https://search.example.com",
  "apiKey": "your-engine-token",
  "llm": { "apiKey": "…", "provider": "openai-compatible", "model": "…" },
  "proxy": { "proxy": "http://user:password@proxy.example.com:8080", "country": "us" },
  "disabledTools": ["fastcrw_research"],
  "monitor": { "apiKey": "your-fastcrw.com-key" }
}
```

Configuration is read afresh on every request. `CRW_API_URL`/`CRW_API_KEY`, `FASTCRW_*` aliases, `FASTCRW_CONFIG`, `FASTCRW_HOME`, and every key with its default and validation rule are in [Configuration](https://github.com/lued/pi-fastcrw/blob/main/docs/configuration.md).

## Commands

| Command | Behavior |
| --- | --- |
| `/fastcrw status` | Resolved URL, key presence (never the value), monitor configuration, `/health`, `/ready`, capabilities. |
| `/fastcrw tools list` | Each tool's active state and approximate schema-token cost. |
| `/fastcrw tools enable\|disable <name\|all>` | Activate or deactivate tools now, persisted in `disabledTools`. |
| `/fastcrw snapshots` | List saved baseline metadata. |
| `/fastcrw metrics` | Renderer breaker and preference summaries. |
| `/fastcrw reset breakers\|preferences [host]` | Admin resets, only after UI confirmation. |

Every active direct tool adds its schema to model requests; use `/fastcrw tools disable` to cut that cost. Full subcommand reference: [Commands](https://github.com/lued/pi-fastcrw/blob/main/docs/commands.md).

## Security at a glance

- Engine and control-plane URLs and keys come only from your environment or config file, each pinned to its own origin; HTTPS is required except on loopback.
- Known keys, proxy credentials and sensitive header values are redacted from results, errors and spill files; fetched text is wrapped as `<untrusted-web-content>`.
- Complete redacted responses are spilled to private `0600` files in a `0700` temp directory; snapshot baselines are `0600` in a `0700` directory. Permissions are not encryption.
- The engine is a trusted service: it receives requested URLs, selected PDF bytes, BYOK tokens and proxy settings. The extension is not a sandbox for it.

Threat model, redaction limits and every local write: [Security model](https://github.com/lued/pi-fastcrw/blob/main/docs/security.md). Reporting a vulnerability: [SECURITY.md](https://github.com/lued/pi-fastcrw/blob/main/SECURITY.md). Running monitors: [Hosted monitors](https://github.com/lued/pi-fastcrw/blob/main/docs/monitoring.md). Coexisting with the `crw` MCP server and the full feature matrix: [Coverage](https://github.com/lued/pi-fastcrw/blob/main/docs/coverage.md).

## Development

```bash
npm ci
npm run check                 # strict type-check: index.ts, test.mts, smoke.mts
npm test                      # offline: real SDK + local mock engine, no credentials
npm run check:secrets         # fail on credential shapes or private home paths
npm run smoke                 # live: uses your user config, real engine requests
npm pack --dry-run            # inspect the published file list
```

Implementation stays in `index.ts`; offline tests in `test.mts`, live tests in `smoke.mts`. pi loads TypeScript directly, so there is no build step. Test coverage, live-smoke scope, manual in-pi checks and troubleshooting live in [Testing](https://github.com/lued/pi-fastcrw/blob/main/docs/testing.md). Repository and release security defaults are in [Release checklist](https://github.com/lued/pi-fastcrw/blob/main/docs/release-checklist.md).

## License

[MIT](LICENSE), copyright 2026 xander.
