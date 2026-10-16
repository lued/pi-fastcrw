# Changelog

## 1.1.0

- Webhook signing secret is shown once to the human via a UI notification (never to the model).
- New hosted-only `fastcrw_monitor` tool for the fastcrw.com control plane: `create | list | get | update | delete | run | checks | check | balance`, mapped to the documented `/v1/monitor*` and `/v1/account/balance` routes.
- It is registered only when `monitor.apiKey` or `FASTCRW_MONITOR_API_KEY` is configured. The config file is read synchronously at load, so without a key the tool never exists or becomes active. `monitor.url` / `FASTCRW_MONITOR_URL` default to `https://fastcrw.com/api`.
- The monitor key is origin-pinned and redacted separately. The engine key is never reused or sent to the control plane, and the monitor key never reaches the engine.
- Webhook signing secrets and webhook header values are withheld from model text, details and spills. The tool also enforces HTTPS-only webhooks, gives an actionable 409 when a run overlaps, validates schedule/target/retention/email locally, and follows only a same-route link-shaped `next` cursor.
- `request()` is generalized into a shared pinned-origin `send()`. `/fastcrw status` reports the monitor configuration, and `/fastcrw tools` lists `fastcrw_monitor` when it is registered.
- Offline control-plane mock tests, plus an opt-in read-only `npm run smoke -- --monitor`. Not verified against the live hosted API.

## 1.0.0

- Manual-check fixes: query chunks default to `bm25` ranking; `forget` by tag alone; first observation shown as a new baseline; research `references`/`citers` described on `action`/`mode`; `/fastcrw metrics` and other non-JSON errors (e.g. HTML 404 pages) show a short message.
- Release packaging, MIT license, Node 22.19+ support, reproducible lockfile and Node 22/24 CI.
- Offline SDK integration tests, including auth/redaction, jobs, snapshots, uploads and rendering.
- Persisted `/fastcrw tools list|enable|disable` controls and schema-token estimates.
- Compact themed renderers with progress, expansion and terminal-control escaping.
- Isolated config/store overrides, actionable capability errors and public documentation.
- Opt-in live crawl abort/cancellation smoke check.

## 0.2.0

- Nine REST-native tools covering search, scraping, discovery, jobs, changes, PDF upload and research.
- BYOK/proxy configuration, capability preflight, private snapshots and redacted response spills.
- Expanded live smoke coverage and `/fastcrw` status, metrics and confirmed admin resets.

## 0.1.0

- Initial pi extension with native fastCRW tool registration and user-scoped engine configuration.
