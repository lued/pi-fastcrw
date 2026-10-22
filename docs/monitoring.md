# Hosted monitors (`fastcrw_monitor`)

Scheduled monitors on the fastcrw.com control plane. Offline-tested; not verified against the live hosted API.

Scheduled monitors run only on the **hosted control plane** at `https://fastcrw.com/api`. The engine lives on a different host (`https://api.fastcrw.com`). Self-hosted engines have no `/v1/monitor` routes (404); for self-hosting, use `fastcrw_changes` with your own scheduler.

> **Not verified against the live hosted API.** This tool follows the published fastCRW monitoring docs and is tested offline against a mock control plane only. Response shapes the docs leave open are shown as returned (wrapped and redacted), not guessed.

**Enable it** by adding a control-plane key to `~/.pi/agent/fastcrw.json` (or `FASTCRW_CONFIG`), or by setting `FASTCRW_MONITOR_API_KEY`, then `/reload`:

```json
{ "monitor": { "apiKey": "your-fastcrw.com-key" } }
```

- **Registration:** pi does not allow runtime calls while the extension factory runs. The factory therefore reads the config file synchronously and registers `fastcrw_monitor` only if a monitor key is present. Without one the tool does not exist, so no `--tools` pattern, `defaultTools` or `/fastcrw tools enable all` can expose it. Each call still re-reads config, so a removed key fails with a clear error.
- **Key:** the fastCRW docs use one `$CRW_API_KEY` in both engine and control-plane examples, but they never say the keys are interchangeable. The engine `apiKey` is therefore **never** reused. If your hosted engine key is the same account key, set it again as `monitor.apiKey`. The monitor key is sent only to the pinned monitor origin and the engine key only to the engine. Redirects are manual, and both keys are redacted everywhere.
- **Base URL:** `monitor.url` / `FASTCRW_MONITOR_URL` default to `https://fastcrw.com/api`. The `/api` path is kept. HTTPS is required except on loopback.

| Action | Fields | Route |
| --- | --- | --- |
| `create` | `name`, `schedule`, `targets` (required); `goal`; `advanced.{judgeEnabled, retentionDays, webhook, notification}` | `POST /v1/monitor` |
| `list` | — | `GET /v1/monitor` |
| `get` / `delete` | `id` | `GET` / `DELETE /v1/monitor/{id}` |
| `update` | `id` + at least one create field (no defaults injected) | `PATCH /v1/monitor/{id}` |
| `run` | `id` | `POST /v1/monitor/{id}/run` |
| `checks` | `id`; `status` (`queued`, `running`, `completed`, `failed`, `partial`, `skipped_overlap`); `next` | `GET /v1/monitor/{id}/checks` |
| `check` | `id`, `checkId`; `status` (`same`, `new`, `changed`, `removed`, `error`); `next` | `GET /v1/monitor/{id}/checks/{checkId}` |
| `balance` | — | `GET /v1/account/balance` |

- **Schedule:** `{cron}` or `{text}` (e.g. `every 30 minutes`, `daily at 9am`), not both; `timezone` is an IANA zone, sent as `UTC` on create when omitted. Intervals provably under 15 minutes (`every 5 minutes`, `*/5 * * * *`, `0,10 * * * *`) are rejected locally. The server validates everything else and returns the normalized cron.
- **Targets:** 1–50. `scrape` needs `urls` (≤50 distinct across all targets). `crawl` needs `url`, with optional `maxPages` (server default 1000). `changeMode` `json`/`mixed` require `jsonSchema`. `scrapeOptions`/`crawlOptions` accept only a documented engine subset: main-content, JS/wait, selectors/tags, target headers, renderer, country; crawl also takes `maxDepth`. Formats, cache, and LLM fields are excluded because the monitor controls them.
- **Goal/judge:** `goal` ≤2 KB turns on the hosted judge automatically. Set `advanced.judgeEnabled:false` to store a goal without judging.
- **Notifications:** `advanced.webhook` `{url (HTTPS only), events, headers, metadata}`. `advanced.notification.email` `{enabled, recipients (≤25), includeDiffs}`; new recipients must confirm a double opt-in link.
- **Webhook secrets:** the signing secret (`webhookSecret`, shown once on create), any other `*secret*`/`*signature*` fields, and webhook header values are **withheld**. They never appear in model text, `details` or spill files. View the secret on the fastcrw.com dashboard, or rotate it with `update` and a new `advanced.webhook`. In an interactive pi session (TUI/RPC) the `webhookSecret` from `create`/webhook rotation is shown **once to you** in a UI notification (not the model transcript), since fastCRW returns it only once; headless runs cannot show it, so rotate it later from an interactive session.
- **Run:** asynchronous, consumes credits, and is never retried. An HTTP 409 means a check is already in flight; the error tells you to inspect `checks status=running`.
- **Pagination:** `checks`/`check` return one server page. The docs call `next` an *opaque cursor* but do not say how to send it back. A link-shaped `next` (absolute URL, `/path?…` or `?…`) is followed only if it targets the same pinned origin and route. A bare token is reported, not guessed at.
- **Output:** a short summary (id, status, next run, credits, summary counts, `next`), then the response wrapped as untrusted content, with check pages/diffs wrapped per page URL. The full redacted response is spilled as usual. `balance` and `list` are shown as returned, because the docs do not pin their shapes. Annotations: `destructiveHint:true`.
