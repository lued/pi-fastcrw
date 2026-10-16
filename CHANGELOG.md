# Changelog

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
