# Compatibility

What this release was actually run against, and where the version pins live.

## Supported versions

| Component | Supported |
| --- | --- |
| pi | **1.3.0 and 1.4.0** (loaded and executed through the real pi extension runtime in both). Older 1.x has no such record. |
| Node.js | **22.19+**. CI runs 22 and 24; the release was also exercised on 26. |
| fastCRW engine | REST API **v0.37.x** (the version this release was written against). Newer engines are expected to work; `fastcrw_search` and `fastcrw_scrape` were exercised against engine **0.39.0** on 2026-10-22, the remaining tools were not. |
| Hosted control plane | `https://fastcrw.com/api`. `fastcrw_monitor` is **not verified against the live hosted API** — see [Hosted monitors](monitoring.md). |

The four `peerDependencies` (`@earendil-works/pi-*`, `typebox`) are host packages that pi itself supplies to extensions. Pi's package authoring contract (`docs/packages.md`) requires them to be declared with a `"*"` range and never bundled, which is what this package does; the exact versions actually exercised are pinned in `devDependencies`.
