# Configuration

Config file `~/.pi/agent/fastcrw.json`: every key, every environment variable, and precedence.

## Configuration

User-only file: `~/.pi/agent/fastcrw.json`. Project files cannot choose an engine or credential target. Configuration is read afresh on each request. Optional full example:

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
  },
  "disabledTools": ["fastcrw_research"]
}
```

Add `"monitor": { "apiKey": "your-fastcrw.com-key" }` only if you use hosted monitors ([Hosted monitors](monitoring.md)).

Only `apiUrl`/`apiKey` are needed for an authenticated engine with its own LLM. Omit `llm` and `proxy` unless you want overrides. Restrict this file to your user:

```bash
chmod 600 ~/.pi/agent/fastcrw.json
```

## Full configuration reference

| Key | Default | Meaning |
| --- | --- | --- |
| `apiUrl` | `http://localhost:3000` | Engine REST base URL, optionally including a path prefix. HTTPS required except loopback; embedded credentials, query and fragment rejected. |
| `apiKey` | unset | Engine bearer token. Optional for an unauthenticated engine. |
| `llm.apiKey` | unset | BYOK provider token; sent to the trusted engine when supported. |
| `llm.provider` | server default | Provider name accepted by your engine. Requires `llm.apiKey`. |
| `llm.model` | server default | Provider model ID. Requires `llm.apiKey`. |
| `llm.baseUrl` | server default | LLM endpoint override; never forwarded to extract. Requires `llm.apiKey`. |
| `proxy.proxy` | unset | Single proxy URL; may contain proxy credentials. |
| `proxy.proxyList` | unset | Array of proxy URLs. Crawl uses this instead of a single proxy. |
| `proxy.proxyRotation` | server default | `round_robin`, `random`, or `sticky_per_host`. |
| `proxy.country` | unset | Egress country hint; supported per-call country overrides take precedence. |
| `monitor.apiKey` | unset | Hosted control-plane bearer key. **`fastcrw_monitor` is registered only when this (or `FASTCRW_MONITOR_API_KEY`) is set.** Never inferred from `apiKey`. |
| `monitor.url` | `https://fastcrw.com/api` when a monitor key is set | Control-plane base URL, path kept (`/api` + `/v1/monitor`). Same HTTPS/loopback rule as `apiUrl`. A URL without a key does not register the tool. |
| `disabledTools` | `[]` | Full tool names excluded on `session_start`. `/fastcrw tools` updates this atomically, preserving other keys. |

| Environment variable | Meaning / precedence |
| --- | --- |
| `CRW_API_URL` | Nonempty value wins over `FASTCRW_API_URL`, then file `apiUrl`, then the default. |
| `FASTCRW_API_URL` | Engine URL alias, lower priority than `CRW_API_URL`. |
| `CRW_API_KEY` | Nonempty value wins over `FASTCRW_API_KEY`, then file `apiKey`. |
| `FASTCRW_API_KEY` | Engine key alias, lower priority than `CRW_API_KEY`. |
| `FASTCRW_MONITOR_API_KEY` | Nonempty value wins over file `monitor.apiKey`. Registration is checked when the extension loads, so `/reload` after adding or removing it. |
| `FASTCRW_MONITOR_URL` | Nonempty value wins over file `monitor.url`, then the default. |
| `FASTCRW_CONFIG` | Override the config **file** path; also used for persisted tool controls. Default: `~/.pi/agent/fastcrw.json`. |
| `FASTCRW_HOME` | Override the local state **directory**; snapshots live in its `snapshots/` child. Default: `~/.pi/agent/fastcrw`. Does not relocate config. |
| `HOME` | Determines default user paths when the explicit overrides are absent. |

There are no LLM/proxy environment overrides or shell-command/variable interpolation inside JSON. Unknown config keys are preserved. Malformed JSON, a non-object root, or a non-string-array `disabledTools` produces a clear error, not a silent fallback. Keep override paths in a trusted environment; do not set them from untrusted repository scripts.

`llm` is flattened to `llmApiKey`/`llmProvider`/`llmModel`/`baseUrl` for search, scrape, and batch. Extract receives the first three, **never `baseUrl`**. Provider/model/base URL overrides require `llm.apiKey`. Crawl JSON and PDF-upload JSON/summary use the **server's** LLM, not BYOK. LLM credentials are config-only, not tool parameters.

`proxy` applies to scrape, batch, and crawl. A call's `advanced.country` overrides configured country. Crawl accepts a proxy pool; a configured single `proxy` becomes a one-entry `proxyList` when no pool is configured. Rotation choices: `round_robin`, `random`, `sticky_per_host`. Proxy URLs/credentials are config-only. `country` is an egress hint, **not** search-result geography.

The engine token is sent only to the configured origin; redirects and returned job cursors cannot send it elsewhere. Known engine/LLM keys, proxy URLs/userinfo, and sensitive target-header values are redacted from responses/errors/spills. Credentials are never written to snapshot metadata.
