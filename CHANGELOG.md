# Changelog

Notable changes to `pi-fastcrw`. Versions are semver; the release sections added from 1.1.0 on carry a date.

## Unreleased

Documentation only; no runtime change.

- README is now a landing page: tagline, working install commands, a three-command quick start, the tool and command tables, a security summary and a documentation index. It is 125 lines instead of 337.
- The reference material moved unchanged into `docs/`: `configuration.md`, `tools.md`, `commands.md`, `security.md`, `monitoring.md`, `coverage.md`, `testing.md`, `compatibility.md`. `package.json` publishes `docs/` so the links resolve in the tarball.
- Install section corrected: `pi install npm:pi-fastcrw` returned npm 404 on 2026-10-22, so the README now leads with the pinned git tag and local checkout and states npm publication as pending. Nothing has been published to npm, despite the 1.1.0 heading below.
- First real product image: `docs/images/session.png`, a pty capture of a live pi session calling
  `fastcrw_search` and `fastcrw_scrape` against a running engine (amber-oled theme, collapsed tool
  cards). The README embeds it by absolute URL so it renders on GitHub, npm and the gallery, and
  `pi.image` in the manifest points the package gallery at the same file.

## 1.1.0 — 2026-10-21

First public npm release.

- Webhook signing secret is shown once to the human via a UI notification (never to the model).
- New hosted-only `fastcrw_monitor` tool for the fastcrw.com control plane: `create | list | get | update | delete | run | checks | check | balance`, mapped to the documented `/v1/monitor*` and `/v1/account/balance` routes.
- It is registered only when `monitor.apiKey` or `FASTCRW_MONITOR_API_KEY` is configured. The config file is read synchronously at load, so without a key the tool never exists or becomes active. `monitor.url` / `FASTCRW_MONITOR_URL` default to `https://fastcrw.com/api`.
- The monitor key is origin-pinned and redacted separately. The engine key is never reused or sent to the control plane, and the monitor key never reaches the engine.
- Webhook signing secrets and webhook header values are withheld from model text, details and spills. The tool also enforces HTTPS-only webhooks, gives an actionable 409 when a run overlaps, validates schedule/target/retention/email locally, and follows only a same-route link-shaped `next` cursor.
- `request()` is generalized into a shared pinned-origin `send()`. `/fastcrw status` reports the monitor configuration, and `/fastcrw tools` lists `fastcrw_monitor` when it is registered.
- Offline control-plane mock tests, plus an opt-in read-only `npm run smoke -- --monitor`. Not verified against the live hosted API.

### Packaging and publication (2026-10-21)

- npm metadata completed for a public package: `repository`, `homepage`, `bugs`, `author` (with profile URL), `engines.node >= 22.19`, `publishConfig.access = "public"`. No runtime dependency was added; the package still installs nothing and depends only on the host packages pi provides.
- `peerDependencies` were reviewed rather than changed. `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui` and `typebox` are all host-provided packages, so pi's own package contract (`docs/packages.md`) requires the `"*"` range and forbids bundling them or listing them under `dependencies`. The tested versions are pinned in `devDependencies` instead, and this release was additionally loaded and exercised against pi 1.4.0 as well as the pinned 1.3.0.
- Packed artifact verified: `npm pack` produces 5 files (`index.ts`, `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json`), 44.0 kB packed / 134.0 kB unpacked. That tarball was installed into a throwaway project with its own `HOME` and pi agent directory, and it loaded through the real pi extension runtime, registered all nine tools and executed `fastcrw_search` (loopback engine) and `fastcrw_changes` diff without touching the live `~/.pi`.
- Whole-history secret scan found no credentials, keys, tokens, `.env`-style files or private material: every blob in the object database and every path ever tracked (123 distinct paths across the full history) was scanned, and the only pattern matches were documented placeholders, example hosts and npm `integrity` hashes.
- README rewritten for a first-time reader: a package summary table, install and removal commands, an explicit supported-version table (pi 1.3.0/1.4.0, Node 22.19+), a numbered first-run checklist and a statement of what the extension talks to on the network.

### Decision: ship 1.1.0, not 1.1.1

Nothing above changed runtime behaviour; the only code-adjacent edits are manifest and documentation, and `1.1.0` had never been published to npm. Publishing it first keeps the version line gap-free, so the public package starts at `1.1.0` with correct metadata instead of leaving an unpublished `1.1.0` behind a `1.1.1` patch.

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
